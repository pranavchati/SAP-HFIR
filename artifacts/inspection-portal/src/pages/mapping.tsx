import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, CheckCircle2, Link2, LoaderCircle, TriangleAlert } from "lucide-react";
import {
  getGetPortalDashboardQueryKey,
  getListNotificationsQueryKey,
  getListTransactionHistoryQueryKey,
  getListWorkOrdersQueryKey,
  useListTemplates,
  useListWorkOrders,
  useSubmitTemplateMapping,
} from "@workspace/api-client-react";
import { Link } from "wouter";

export default function MappingPage() {
  const workOrdersQuery = useListWorkOrders({});
  const templatesQuery = useListTemplates();
  const submitMapping = useSubmitTemplateMapping();
  const queryClient = useQueryClient();
  const [workOrderNo, setWorkOrderNo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const workOrders = workOrdersQuery.data ?? [];
  const availableWorkOrders = workOrders.filter((workOrder) => workOrder.mappingState !== "Submitted");
  const activeTemplates = (templatesQuery.data?.templates ?? []).filter((template) => template.active);
  const sampleWorkOrders = availableWorkOrders.filter((workOrder) => workOrder.workOrderNo.startsWith("00009991"));
  const selectedWorkOrder = availableWorkOrders.find((workOrder) => workOrder.workOrderNo === workOrderNo);
  const loading = workOrdersQuery.isLoading || templatesQuery.isLoading;
  const failed = workOrdersQuery.isError || templatesQuery.isError;
  const canSubmit = !!selectedWorkOrder && activeTemplates.some((template) => template.id === templateId) && !loading && !failed && !submitMapping.isPending;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");
    try {
      const result = await submitMapping.mutateAsync({
        data: {
          workOrderNo,
          templateId,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      setSuccessMessage(result.message);
      setWorkOrderNo("");
      setTemplateId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListWorkOrdersQueryKey({}) }),
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPortalDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListTransactionHistoryQueryKey() }),
      ]);
    } catch {
      setErrorMessage("Could not submit the mapping. Refresh the work orders and try again.");
    }
  };

  return (
    <div className="page-enter">
      <div className="mb-7">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[.19em] text-primary">SAP–HFIR coordination</div>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-.045em] text-foreground sm:text-[37px]">Mapping</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Link an imported SAP work order to an active HFIR round template. Submitting saves the mapping and adds a notification; it does not schedule a round in HFIR.
        </p>
      </div>

      {successMessage && (
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[#47836d]/25 bg-[#47836d]/5 px-4 py-3 sm:flex-row sm:items-center" role="status" data-testid="mapping-success">
          <CheckCircle2 size={17} className="shrink-0 text-[#47836d]" />
          <span className="flex-1 text-xs font-semibold">{successMessage}</span>
          <Link href="/notifications" className="btn-quiet inline-flex items-center gap-1 text-[10px]" data-testid="link-mapping-notification">
            View notification <ArrowRight size={12} />
          </Link>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border p-5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-[#f1e1d0] text-[#995b30]">
              <Link2 size={17} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold">Create a template mapping</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">Choose one SAP work order and one HFIR template.</p>
            </div>
          </div>

          {failed && (
            <div className="flex items-start gap-3 p-5 text-xs" role="alert">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[#b04d40]" />
              <div>
                <div className="font-semibold">Couldn’t load mapping choices</div>
                <p className="mt-1 text-muted-foreground">The work orders or HFIR template catalog could not be loaded.</p>
                <button
                  className="btn-secondary mt-3 text-[10px]"
                  type="button"
                  onClick={() => {
                    void workOrdersQuery.refetch();
                    void templatesQuery.refetch();
                  }}
                  data-testid="button-retry-mapping-options"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 p-5 text-xs text-muted-foreground" role="status">
              <LoaderCircle size={15} className="animate-spin" /> Loading work orders and templates…
            </div>
          )}
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 p-5">
              {!availableWorkOrders.length && (
                <div className="rounded-md border border-[#d8d2c7] bg-[#f3f0e8] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground" data-testid="mapping-no-orders">
                  All work orders visible to your role already have a submitted mapping. Ask an administrator or planner to revise an existing handoff.
                </div>
              )}
              {!activeTemplates.length && (
                <div className="rounded-md border border-[#d8d2c7] bg-[#f3f0e8] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground" data-testid="mapping-no-templates">
                  No active HFIR templates are available. Import an active template catalog before submitting a mapping.
                </div>
              )}

              <label className="field-label block">
                SAP work order
                <select
                  className="field-input mt-1"
                  value={workOrderNo}
                  onChange={(event) => {
                    setWorkOrderNo(event.target.value);
                    setSuccessMessage("");
                    setErrorMessage("");
                  }}
                  required
                  disabled={loading || failed || !availableWorkOrders.length}
                  data-testid="select-mapping-work-order"
                >
                  <option value="">Select an SAP work order</option>
                  {availableWorkOrders.map((workOrder) => (
                    <option key={workOrder.workOrderNo} value={workOrder.workOrderNo}>
                      {workOrder.workOrderNo} · {workOrder.description}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label block">
                HFIR round template
                <select
                  className="field-input mt-1"
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    setSuccessMessage("");
                    setErrorMessage("");
                  }}
                  required
                  disabled={loading || failed || !activeTemplates.length}
                  data-testid="select-mapping-template"
                >
                  <option value="">Select an HFIR template</option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.id}
                    </option>
                  ))}
                </select>
              </label>

              {selectedWorkOrder && (
                <div className="grid gap-3 rounded-md border border-border bg-secondary/40 p-4 text-[10px] sm:grid-cols-3" data-testid="mapping-work-order-summary">
                  <div><div className="field-caption">Asset</div><div className="mt-1 font-semibold">{selectedWorkOrder.asset}</div></div>
                  <div><div className="field-caption">Plant</div><div className="mt-1 font-semibold">{selectedWorkOrder.plant}</div></div>
                  <div><div className="field-caption">Due date</div><div className="mt-1 font-semibold">{selectedWorkOrder.dueDate || "—"}</div></div>
                </div>
              )}

              <div className="border-l-2 border-[#de965f] bg-secondary/55 p-3 text-[10px] leading-relaxed text-muted-foreground">
                This saves a mapping in the portal and creates one notification. It does not assign an operator or trigger HFIR scheduling or SAP transmission.
              </div>

              {errorMessage && <div className="text-xs text-destructive" role="alert" data-testid="mapping-error">{errorMessage}</div>}

              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[10px] text-muted-foreground">Admins and planners can revise submitted mappings from Imported work orders.</span>
                <button
                  className="btn-primary inline-flex items-center justify-center gap-2"
                  type="submit"
                  disabled={!canSubmit}
                  data-testid="button-submit-template-mapping"
                >
                  {submitMapping.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  {submitMapping.isPending ? "Submitting…" : "Submit mapping"}
                </button>
              </div>
            </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5" data-testid="mapping-sample-data">
            <h2 className="font-display text-sm font-bold">Sample work orders</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">These shared demo records are available to every role. Choose one below, then select an HFIR template above.</p>
            <div className="mt-3 space-y-2">
              {sampleWorkOrders.map((workOrder) => (
                <button key={workOrder.workOrderNo} type="button" className="block w-full rounded-md border border-border bg-secondary/35 p-3 text-left hover:border-primary disabled:opacity-50" disabled={loading || failed || submitMapping.isPending} data-testid={`button-sample-mapping-${workOrder.workOrderNo}`} onClick={() => { setWorkOrderNo(workOrder.workOrderNo); setSuccessMessage(""); setErrorMessage(""); }}>
                  <span className="block font-mono text-[11px] font-semibold">{workOrder.workOrderNo}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">{workOrder.description}</span>
                  <span className="mt-1 block text-[10px] text-primary">{workOrder.asset} · {workOrder.plant}</span>
                </button>
              ))}
              {!sampleWorkOrders.length && <p className="text-[11px] text-muted-foreground">{loading ? "Loading samples…" : failed ? "Sample records will appear when the connection is restored." : "These samples have already been mapped. Other available work orders are listed in the dropdown."}</p>}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 font-display text-sm font-bold"><Bell size={15} className="text-primary" /> After you submit</div>
            <ol className="mt-4 space-y-4">
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">1</span><span className="pt-1 text-[11px] leading-relaxed text-muted-foreground">The SAP work order is linked to the selected HFIR template.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">2</span><span className="pt-1 text-[11px] leading-relaxed text-muted-foreground">A notification records the SAP number and template in the Notifications menu.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">3</span><span className="pt-1 text-[11px] leading-relaxed text-muted-foreground">Scheduling and execution still happen separately in HFIR.</span></li>
            </ol>
          </div>
          <div className="rounded-lg border border-border bg-secondary/35 p-4 text-[10px] leading-relaxed text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">Existing submitted mappings are protected</div>
            Admins and planners can revise an active mapping from Imported work orders. Revisions preserve history and require a reason.
          </div>
        </aside>
      </div>
    </div>
  );
}
