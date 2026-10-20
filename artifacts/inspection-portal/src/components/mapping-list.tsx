import type { WorkOrder } from "@workspace/api-client-react";

export default function MappingList({ workOrders, loading, failed }: {
  workOrders: WorkOrder[];
  loading: boolean;
  failed: boolean;
}) {
  const mappings = workOrders.filter((order) => !!order.templateId && order.mappingState !== "Unmapped");
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm" data-testid="saved-mappings">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold">Saved mappings</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">SAP work orders linked to HFIR templates, including shared sample mappings.</p>
        </div>
        <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold">{mappings.length} mappings</span>
      </div>
      {loading ? <p className="p-5 text-xs text-muted-foreground" role="status">Loading mappings…</p>
        : failed ? <p className="p-5 text-xs text-destructive" role="alert">Mappings could not be loaded. Use Try again below to reload the work orders.</p>
        : !mappings.length ? <p className="p-5 text-xs text-muted-foreground">No mappings yet. Submit a work order and template below to create one.</p>
        : <div className="max-h-[260px] overflow-auto">
          <table className="w-full min-w-[780px] text-left text-[11px]">
            <thead className="sticky top-0 bg-secondary">
              <tr className="table-head"><th>SAP work order</th><th>HFIR round template</th><th>Asset / plant</th><th>Mapping status</th></tr>
            </thead>
            <tbody>
              {mappings.map((order) => (
                <tr key={order.workOrderNo} className="table-row" data-testid={`row-saved-mapping-${order.workOrderNo}`}>
                  <td><div className="font-mono font-semibold">{order.workOrderNo}</div><div className="mt-1 text-[10px] text-muted-foreground">{order.description}</div></td>
                  <td><div className="font-semibold">{order.templateName}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{order.templateId}</div></td>
                  <td><div>{order.asset}</div><div className="mt-1 text-[10px] text-muted-foreground">{order.plant}</div></td>
                  <td><span className={order.mappingState === "Submitted" ? "badge-green" : "badge-neutral"}>{order.mappingState}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
    </section>
  );
}
