import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RawMaterial } from "@/lib/erpStore";
import { fmtINR, fmtNum, todayStr, withGst, SELL_GST_RATE } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { Filter, Plus, Search, Trash2, X, FileSpreadsheet, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Mode = "purchase" | "sell";
type Row = RawMaterial & { vehicle_number?: string; gadi_bhada?: number };
type Props = { rows: Row[]; readOnly: boolean; mode: Mode; onChanged?: () => void | Promise<void> };

// purchase: stock+, money- by payment | sell: stock-, money+ by payment
export function LedgerTable({ rows, readOnly, mode, onChanged }: Props) {
  const isSell = mode === "sell";
  const table = isSell ? "sells" : "raw_materials";
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sheetDate, setSheetDate] = useState(todayStr());
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // For sells: display total = (rate + gadi_bhada) * qty * 1.05  (5% GST baked in)
  // For purchase: display total = total_amount (rate*qty)
  const displayTotal = (r: Row) => {
    const base = isSell
      ? (Number(r.rate) || 0) * (Number(r.quantity) || 0) + (Number(r.gadi_bhada) || 0) * (Number(r.quantity) || 0)
      : Number(r.total_amount) || 0;
    return isSell ? withGst(base) : base;
  };
  const displayWithoutGB = (r: Row) => {
    const base = (Number(r.rate) || 0) * (Number(r.quantity) || 0);
    return isSell ? withGst(base) : base;
  };

  // filtered
  const filtered = useMemo(() => rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (from && r.entry_date < from) return false;
    if (to && r.entry_date > to) return false;
    return true;
  }), [rows, q, from, to]);

  const dayRows = filtered.filter((r) => r.entry_date === sheetDate);
  const yearRows = filtered.filter((r) => r.entry_date.slice(0, 4) === sheetDate.slice(0, 4));
  const dayAmt = dayRows.reduce((s, r) => s + displayTotal(r), 0);
  const dayQty = dayRows.reduce((s, r) => s + Number(r.quantity), 0);
  const yearAmt = yearRows.reduce((s, r) => s + displayTotal(r), 0);
  const yearQty = yearRows.reduce((s, r) => s + Number(r.quantity), 0);

  const [form, setForm] = useState({ entry_date: todayStr(), name: "", rate: "", quantity: "", payment: "", vehicle_number: "", gadi_bhada: "" });
  function resetForm() { setForm({ entry_date: todayStr(), name: "", rate: "", quantity: "", payment: "", vehicle_number: "", gadi_bhada: "" }); }

  const moneyCol = isSell ? "sell_money" : "total_money";

  async function adjustMoney(delta: number) {
    if (!delta) return;
    const { data: s } = await supabase.from("settings").select(moneyCol).eq("id", 1).single();
    if (!s) return;
    const current = Number((s as Record<string, number>)[moneyCol] || 0);
    const next = isSell ? current + delta : current - delta;
    const update = isSell ? { sell_money: next } : { total_money: next };
    await supabase.from("settings").update(update).eq("id", 1);
  }

  async function addRow() {
    const rate = Number(form.rate) || 0;
    const qty = Number(form.quantity) || 0;
    const payment = Number(form.payment) || 0;
    const gb = Number(form.gadi_bhada) || 0;
    const insertPayload: Record<string, unknown> = { entry_date: form.entry_date, name: form.name, rate, quantity: qty, payment };
    if (isSell) {
      insertPayload.vehicle_number = form.vehicle_number;
      insertPayload.gadi_bhada = gb;
    }
    const { data, error } = await (supabase.from(table as never) as never as ReturnType<typeof supabase.from>)
      .insert(insertPayload).select().single();
    if (error) return toast.error(error.message);

    if (payment) await adjustMoney(payment);
    if (data) await logAudit("created", table, (data as { id: string }).id, { row: data });
    setAddOpen(false);
    resetForm();
    await onChanged?.();
    toast.success("Entry added");
  }

  async function updateField(row: Row, field: "entry_date" | "name" | "rate" | "quantity" | "payment" | "vehicle_number" | "serial_number" | "gadi_bhada", value: string) {
    const isNum = field === "rate" || field === "quantity" || field === "payment" || field === "serial_number" || field === "gadi_bhada";
    const newVal = isNum ? Number(value) || 0 : value;
    const before = { [field]: (row as Record<string, unknown>)[field] };
    const { error } = await (supabase.from(table as never) as never as ReturnType<typeof supabase.from>)
      .update({ [field]: newVal }).eq("id", row.id);
    if (error) return toast.error(error.message);

    if (field === "payment") {
      const delta = (Number(value) || 0) - Number(row.payment || 0);
      if (delta !== 0) await adjustMoney(delta);
    }
    await logAudit("updated", table, row.id, { field, before, after: { [field]: newVal } });
    await onChanged?.();
  }

  async function deleteRow(row: Row) {
    if (!confirm(`Delete entry #${row.serial_number}?`)) return;
    const { error } = await (supabase.from(table as never) as never as ReturnType<typeof supabase.from>).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    if (Number(row.payment)) await adjustMoney(-Number(row.payment));
    await logAudit("deleted", table, row.id, { row });
    await onChanged?.();
    toast.success("Entry deleted");
  }

  function exportExcel() {
    const data = filtered.map((r) => {
      const total = displayTotal(r);
      const without = displayWithoutGB(r);
      const base: Record<string, string | number> = { "Pc No.": r.serial_number, Date: r.entry_date, Name: r.name };
      if (isSell) base["Vehicle No."] = r.vehicle_number || "";
      base.Qty = Number(r.quantity);
      base.Rate = Number(r.rate);
      if (isSell) base["Gadi Bhada"] = Number(r.gadi_bhada || 0);
      base[isSell ? "Total Amount (incl. 5% GST)" : "Amount"] = total;
      if (isSell) base["Amount w/o Gadi Bhada (incl. 5% GST)"] = without;
      base.Payment = Number(r.payment);
      base.Difference = total - Number(r.payment);
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isSell ? "Sells" : "Raw Material");
    XLSX.writeFile(wb, `${mode}-${sheetDate}.xlsx`);
  }
  function exportPDF() {
    const doc = new jsPDF();
    doc.text(`${isSell ? "Sells" : "Raw Material"} Sheet`, 14, 14);
    const head = isSell
      ? [["Pc", "Date", "Name", "Vehicle", "Qty", "Rate", "Gadi", "Total (GST)", "Amt w/o GB", "Pay", "Diff"]]
      : [["Pc", "Date", "Name", "Qty", "Rate", "Amount", "Payment", "Diff"]];
    const body = filtered.map((r) => {
      const total = displayTotal(r);
      const without = displayWithoutGB(r);
      const diff = total - Number(r.payment);
      if (isSell) return [r.serial_number, r.entry_date, r.name, r.vehicle_number || "", Number(r.quantity), Number(r.rate), Number(r.gadi_bhada || 0), total.toFixed(2), without.toFixed(2), Number(r.payment).toFixed(2), diff.toFixed(2)];
      return [r.serial_number, r.entry_date, r.name, Number(r.quantity), Number(r.rate), total.toFixed(2), Number(r.payment).toFixed(2), diff.toFixed(2)];
    });
    autoTable(doc, { startY: 20, styles: { fontSize: 7 }, head, body });
    doc.save(`${mode}-${sheetDate}.pdf`);
  }

  return (
    <div className="space-y-3">
      {/* Top control bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Date (Sheet)</Label>
          <Input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} className="h-10 w-44" />
          <p className="mt-1 text-xs text-muted-foreground">{sheetDate.split("-").reverse().join("-")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-10"><Filter className="h-4 w-4" /> Filter</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Filter by date range</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name..." className="pl-8" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label><span className="text-[11px] font-medium uppercase text-muted-foreground">From</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                  <label><span className="text-[11px] font-medium uppercase text-muted-foreground">To</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                </div>
                {(q || from || to) && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Entries</span><span className="font-semibold">{filtered.length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Qty</span><span className="font-semibold tabular-nums">{fmtNum(filtered.reduce((s, r) => s + Number(r.quantity), 0), 3)} t</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Amount{isSell ? " (incl. GST)" : ""}</span><span className="font-semibold tabular-nums">{fmtINR(filtered.reduce((s, r) => s + displayTotal(r), 0))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Payment</span><span className="font-semibold tabular-nums">{fmtINR(filtered.reduce((s, r) => s + Number(r.payment), 0))}</span></div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setQ(""); setFrom(""); setTo(""); }}><X className="h-4 w-4" /> Clear</Button>
                <Button onClick={() => setFilterOpen(false)}>Apply</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={exportExcel} className="h-10"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="h-10"><FileText className="h-4 w-4" /> PDF</Button>
          {!readOnly && (
            <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-10"><Plus className="h-4 w-4" /> Add</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{isSell ? "Add Sell Entry" : "Add Raw Material"}</DialogTitle></DialogHeader>
                <div className="grid gap-3 py-2">
                  <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Date</span><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></label>
                  <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Name</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client / supplier" /></label>
                  {isSell && (
                    <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Vehicle Number</span><Input value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} placeholder="e.g. MH12 AB 1234" /></label>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Qty (t)</span><Input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
                    <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Rate (₹/t)</span><Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></label>
                  </div>
                  {isSell && (
                    <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Gadi Bhada (₹/t)</span><Input type="number" step="0.01" value={form.gadi_bhada} onChange={(e) => setForm({ ...form, gadi_bhada: e.target.value })} /></label>
                  )}
                  <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1 text-sm">
                    {isSell ? (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Amount w/o Gadi Bhada</span><span className="font-semibold tabular-nums">{fmtINR(withGst((Number(form.rate) || 0) * (Number(form.quantity) || 0)))}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Total Amount</span><span className="font-semibold tabular-nums">{fmtINR(withGst(((Number(form.rate) || 0) + (Number(form.gadi_bhada) || 0)) * (Number(form.quantity) || 0)))}</span></div>
                        <p className="text-[10px] text-muted-foreground">Includes 5% GST</p>
                      </>
                    ) : (
                      <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold tabular-nums">{fmtINR((Number(form.rate) || 0) * (Number(form.quantity) || 0))}</span></div>
                    )}
                  </div>
                  <label><span className="text-[11px] font-medium uppercase text-muted-foreground">Payment (₹)</span><Input type="number" step="0.01" value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} /></label>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={addRow}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Daily/Yearly cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Daily Total{isSell ? " (incl. 5% GST)" : ""}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmtINR(dayAmt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Qty: {fmtNum(dayQty, 3)} t</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Yearly Total{isSell ? " (incl. 5% GST)" : ""}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmtINR(yearAmt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Qty: {fmtNum(yearQty, 3)} t · {sheetDate.slice(0, 4)}</p>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 && <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No entries. Tap Add to create one.</p>}
        {filtered.map((r) => {
          const total = displayTotal(r);
          const without = displayWithoutGB(r);
          const diff = total - Number(r.payment);
          return (
            <div key={r.id} className="rounded-xl border bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>#</span>
                    <input disabled={readOnly} type="number" defaultValue={r.serial_number} onBlur={(e) => Number(e.target.value) !== Number(r.serial_number) && updateField(r, "serial_number", e.target.value)} className="cell-input !h-6 !w-16 !px-1 text-xs tabular-nums" />
                    <span>· {r.entry_date}</span>
                  </div>
                  <p className="text-sm font-semibold mt-0.5">{r.name || "—"}</p>
                  {isSell && r.vehicle_number && <p className="text-[11px] text-muted-foreground font-mono">🚚 {r.vehicle_number}</p>}
                </div>
                {!readOnly && (
                  <button onClick={() => deleteRow(r)} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded bg-muted/30 px-2 py-1.5"><span className="block text-[10px] uppercase text-muted-foreground">Qty</span>
                  <input disabled={readOnly} type="number" step="0.001" defaultValue={r.quantity} onBlur={(e) => Number(e.target.value) !== Number(r.quantity) && updateField(r, "quantity", e.target.value)} className="cell-input text-right tabular-nums !h-8" />
                </div>
                <div className="rounded bg-muted/30 px-2 py-1.5"><span className="block text-[10px] uppercase text-muted-foreground">Rate</span>
                  <input disabled={readOnly} type="number" step="0.01" defaultValue={r.rate} onBlur={(e) => Number(e.target.value) !== Number(r.rate) && updateField(r, "rate", e.target.value)} className="cell-input text-right tabular-nums !h-8" />
                </div>
                {isSell && (
                  <div className="rounded bg-muted/30 px-2 py-1.5"><span className="block text-[10px] uppercase text-muted-foreground">Gadi Bhada</span>
                    <input disabled={readOnly} type="number" step="0.01" defaultValue={r.gadi_bhada || 0} onBlur={(e) => Number(e.target.value) !== Number(r.gadi_bhada || 0) && updateField(r, "gadi_bhada", e.target.value)} className="cell-input text-right tabular-nums !h-8" />
                  </div>
                )}
                <div className="rounded bg-muted/30 px-2 py-1.5"><span className="block text-[10px] uppercase text-muted-foreground">Total{isSell ? " (GST)" : ""}</span><span className="font-semibold tabular-nums">{fmtINR(total)}</span></div>
                {isSell && (
                  <div className="rounded bg-muted/30 px-2 py-1.5 col-span-2"><span className="block text-[10px] uppercase text-muted-foreground">Amount w/o Gadi Bhada (incl. GST)</span><span className="font-semibold tabular-nums">{fmtINR(without)}</span></div>
                )}
                <div className="rounded bg-muted/30 px-2 py-1.5"><span className="block text-[10px] uppercase text-muted-foreground">Payment</span>
                  <input disabled={readOnly} type="number" step="0.01" defaultValue={r.payment} onBlur={(e) => Number(e.target.value) !== Number(r.payment) && updateField(r, "payment", e.target.value)} className="cell-input text-right tabular-nums !h-8" />
                </div>
                <div className={`col-span-2 rounded px-2 py-1.5 flex justify-between ${diff === 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : diff > 0 ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                  <span className="text-[10px] uppercase font-medium">Difference</span>
                  <span className="font-bold tabular-nums">{fmtINR(diff)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-soft md:block">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium w-16">Pc No.</th>
              <th className="px-3 py-2.5 text-left font-medium w-32">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Name</th>
              {isSell && <th className="px-3 py-2.5 text-left font-medium w-36">Vehicle No.</th>}
              <th className="px-3 py-2.5 text-right font-medium w-24">Qty</th>
              <th className="px-3 py-2.5 text-right font-medium w-24">Rate</th>
              {isSell && <th className="px-3 py-2.5 text-right font-medium w-28">Gadi Bhada</th>}
              <th className="px-3 py-2.5 text-right font-medium w-32">Total Amount{isSell ? " (GST)" : ""}</th>
              {isSell && <th className="px-3 py-2.5 text-right font-medium w-36">Amt w/o Gadi Bhada (GST)</th>}
              <th className="px-3 py-2.5 text-right font-medium w-28">Payment</th>
              <th className="px-3 py-2.5 text-right font-medium w-28">Difference</th>
              {!readOnly && <th className="w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={isSell ? 12 : 9} className="py-10 text-center text-sm text-muted-foreground">No entries yet.</td></tr>}
            {filtered.map((r) => {
              const total = displayTotal(r);
              const without = displayWithoutGB(r);
              const diff = total - Number(r.payment);
              return (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="px-1 py-1"><input disabled={readOnly} type="number" defaultValue={r.serial_number} onBlur={(e) => Number(e.target.value) !== Number(r.serial_number) && updateField(r, "serial_number", e.target.value)} className="cell-input text-left tabular-nums" /></td>
                  <td className="px-1 py-1"><input disabled={readOnly} type="date" defaultValue={r.entry_date} onBlur={(e) => e.target.value !== r.entry_date && updateField(r, "entry_date", e.target.value)} className="cell-input text-primary" /></td>
                  <td className="px-1 py-1"><input disabled={readOnly} defaultValue={r.name} placeholder="Name" onBlur={(e) => e.target.value !== r.name && updateField(r, "name", e.target.value)} className="cell-input" /></td>
                  {isSell && <td className="px-1 py-1"><input disabled={readOnly} defaultValue={r.vehicle_number || ""} placeholder="Vehicle no." onBlur={(e) => e.target.value !== (r.vehicle_number || "") && updateField(r, "vehicle_number", e.target.value)} className="cell-input font-mono" /></td>}
                  <td className="px-1 py-1"><input disabled={readOnly} type="number" step="0.001" defaultValue={r.quantity} onBlur={(e) => Number(e.target.value) !== Number(r.quantity) && updateField(r, "quantity", e.target.value)} className="cell-input text-right tabular-nums" /></td>
                  <td className="px-1 py-1"><input disabled={readOnly} type="number" step="0.01" defaultValue={r.rate} onBlur={(e) => Number(e.target.value) !== Number(r.rate) && updateField(r, "rate", e.target.value)} className="cell-input text-right tabular-nums" /></td>
                  {isSell && <td className="px-1 py-1"><input disabled={readOnly} type="number" step="0.01" defaultValue={r.gadi_bhada || 0} onBlur={(e) => Number(e.target.value) !== Number(r.gadi_bhada || 0) && updateField(r, "gadi_bhada", e.target.value)} className="cell-input text-right tabular-nums" /></td>}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(total, 2)}</td>
                  {isSell && <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(without, 2)}</td>}
                  <td className="px-1 py-1"><input disabled={readOnly} type="number" step="0.01" defaultValue={r.payment} onBlur={(e) => Number(e.target.value) !== Number(r.payment) && updateField(r, "payment", e.target.value)} className="cell-input text-right tabular-nums" /></td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${diff === 0 ? "" : diff > 0 ? "text-destructive" : "text-amber-600"}`}>{fmtNum(diff, 2)}</td>
                  {!readOnly && <td className="px-2 py-1"><button onClick={() => deleteRow(r)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {isSell && <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">All sell totals include {SELL_GST_RATE * 100}% GST. Total Amount = (Rate + Gadi Bhada) × Qty × 1.05.</p>}
      </div>
    </div>
  );
}
