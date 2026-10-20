import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDownUp, ArrowRight, Bell, Boxes, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Download, FileClock,
  FileUp, HardHat, LayoutDashboard, Link2, LoaderCircle, LogOut, Menu, PackageOpen,
  Plus, Search, Settings2, ShieldCheck, TriangleAlert, Upload,
  UsersRound, X,
} from 'lucide-react';
import {
  getGetPortalAdminQueryKey, getGetPortalDashboardQueryKey, getGetPortalMeQueryKey,
  getGetWorkOrderQueryKey, getListAssignmentsQueryKey, getListNotificationsQueryKey,
  getListRoundsQueryKey, getListTemplatesQueryKey, getListTransactionHistoryQueryKey,
  getExportTransactionHistoryQueryKey, getListWorkOrdersQueryKey,
  useBootstrapPortalAdmin, useExportTransactionHistory, useGetPortalAdmin,
  useGetPortalDashboard, useGetPortalMe, useImportHfirResults, useImportTemplates,
  useImportWorkOrders, useListAssignments, useListNotifications, useListRounds,
  useListTemplates, useListTransactionHistory, useListWorkOrders, useMarkNotificationRead,
  useSaveWorkOrderMapping, useUpdatePortalSettings, useUpdatePortalUserRole,
  useGetWorkOrder, useCompleteRoundAttachmentUpload, useQueueRoundStatusForSap,
  useRequestRoundAttachmentUploadUrl,
} from '@workspace/api-client-react';
import type { HistoryEntry, PortalUserRole, RoundAttachment, RoundExecution, RoundImportRecord, WorkOrder } from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import MappingPage from '@/pages/mapping';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#24636a', colorForeground: '#20333d', colorMutedForeground: '#697981',
    colorDanger: '#a94439', colorBackground: '#fbf9f3', colorInput: '#f3f0e8',
    colorInputForeground: '#20333d', colorNeutral: '#d8d2c7', fontFamily: 'DM Sans',
    borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf9f3] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#20333d] font-bold', headerSubtitle: 'text-[#697981]',
    socialButtonsBlockButtonText: 'text-[#20333d]', formFieldLabel: 'text-[#20333d]',
    footerActionLink: 'text-[#24636a]', footerActionText: 'text-[#697981]',
    dividerText: 'text-[#697981]', identityPreviewEditButton: 'text-[#24636a]',
    formFieldSuccessText: 'text-[#24636a]', alertText: 'text-[#a94439]',
    logoBox: 'mb-3', logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#d8d2c7]',
    formButtonPrimary: 'bg-[#24636a] hover:bg-[#194e54] text-white',
    formFieldInput: 'bg-[#f3f0e8] text-[#20333d] border-[#d8d2c7]',
    footerAction: 'text-[#697981]', dividerLine: 'bg-[#d8d2c7]', alert: 'border-[#a94439]',
    otpCodeFieldInput: 'bg-[#f3f0e8] text-[#20333d]', formFieldRow: 'text-[#20333d]',
    main: 'text-[#20333d]',
  },
};

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['Administrator', 'Planner/Coordinator', 'Operator'] },
  { href: '/mapping', label: 'Mapping', icon: Link2, roles: ['Administrator', 'Planner/Coordinator', 'Operator'] },
  { href: '/assignments', label: 'Assignments', icon: UsersRound, roles: ['Operator'] },
  { href: '/rounds', label: 'HFIR rounds', icon: Activity, roles: ['Administrator', 'Planner/Coordinator', 'Operator'] },
  { href: '/history', label: 'Handoff history', icon: FileClock, roles: ['Administrator', 'Planner/Coordinator', 'Operator'] },
  { href: '/notifications', label: 'Notifications', icon: Bell, roles: ['Administrator', 'Planner/Coordinator', 'Operator'] },
  { href: '/admin', label: 'Administration', icon: Settings2, roles: ['Administrator'] },
];
const sapNavItems = [
  { href: '/import', label: 'Import SAP XML', icon: FileUp },
  { href: '/work-orders', label: 'Imported work orders', icon: ClipboardList },
  { href: '/samples', label: 'Sample work orders', icon: Boxes },
];
const INSTRUCTION = 'Open HFIR, schedule the selected round template, and manually enter this SAP work order number when creating or executing the round.';
const roleOptions: PortalUserRole[] = ['Administrator', 'Planner/Coordinator', 'Operator'];

function ClerkCacheReset() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  useEffect(() => {
    let previous: string | null | undefined;
    return addListener(({ user }) => {
      const current = user?.id ?? null;
      if (previous !== undefined && current !== previous) qc.clear();
      previous = current;
    });
  }, [addListener, qc]);
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sapMenuOpen, setSapMenuOpen] = useState(location === '/import' || location === '/work-orders' || location === '/samples');
  const { user } = useUser();
  const me = useGetPortalMe({ query: { queryKey: getGetPortalMeQueryKey(), enabled: !!user } });
  const isSapRoute = sapNavItems.some((item) => item.href === location);
  const canManageSap = ['Administrator', 'Planner/Coordinator'].includes(me.data?.user?.role ?? '');
  const activeTitle = sapNavItems.find((n) => n.href === location)?.label ?? navItems.find((n) => n.href === location)?.label ?? 'Inspection portal';
  const initials = user?.firstName?.slice(0, 1) || 'O';
  useEffect(() => {
    if (isSapRoute) setSapMenuOpen(true);
  }, [isSapRoute]);
  return <div className="shell-grain min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col bg-[#20343d] text-[#f2efe7] transition-transform duration-200 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[78px] items-center gap-3 border-b border-white/10 px-6">
        <div className="grid h-9 w-9 place-items-center rounded-sm bg-[#e79b5f] text-[#20343d]"><HardHat size={20}/></div>
        <div><div className="font-display text-[15px] font-extrabold tracking-tight">FIELD / DESK</div><div className="text-[9px] uppercase tracking-[.22em] text-white/55">Inspection coordination</div></div>
      </div>
      <div className="px-5 pt-7 pb-2 text-[9px] font-semibold uppercase tracking-[.2em] text-white/40">Operations desk</div>
      <nav className="flex-1 space-y-1 px-3">
        {canManageSap && <div>
          <button type="button" aria-expanded={sapMenuOpen} aria-controls="sap-work-orders-submenu" data-testid="button-nav-sap-work-orders" onClick={() => setSapMenuOpen((open) => !open)} className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] transition-colors ${isSapRoute ? 'text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}>
            <FileUp size={16} strokeWidth={1.8}/><span className="flex-1">SAP work orders</span><ChevronDown size={14} className={`transition-transform ${sapMenuOpen ? 'rotate-180' : ''}`}/>
          </button>
          {sapMenuOpen && <div id="sap-work-orders-submenu" className="ml-5 space-y-1 border-l border-white/15 py-1 pl-2">
            {sapNavItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)} className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-[11px] transition-colors ${location === href ? 'bg-[#e79b5f] font-semibold text-[#20343d]' : 'text-white/65 hover:bg-white/8 hover:text-white'}`}>
              <Icon size={14} strokeWidth={1.8}/><span>{label}</span>
            </Link>)}
          </div>}
        </div>}
        {navItems.filter((item) => item.roles.includes(me.data?.user?.role ?? 'Operator')).map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)} className={`group flex h-10 items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${location === href ? 'bg-[#e79b5f] text-[#20343d] font-semibold' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}>
          <Icon size={16} strokeWidth={1.8}/><span>{label}</span>
          {label === 'Notifications' && <NotificationCount/>}
        </Link>)}
      </nav>
      <div className="mx-4 mb-4 rounded-md border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold"><span className="h-2 w-2 rounded-full bg-[#e79b5f]"/><span>Separate systems. One clear handoff.</span></div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/50">HFIR schedules and execution are managed outside this portal.</p>
      </div>
      <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#3b5961] text-xs font-bold">{initials}</div>
        <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Portal operator'}</div><div className="truncate text-[10px] text-white/45">{user?.primaryEmailAddress?.emailAddress || 'Signed-in account'}</div></div>
        <LogoutControl/>
      </div>
    </aside>
    {mobileOpen && <button aria-label="Close menu" data-testid="button-close-menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-[#16252c]/50 md:hidden"/>}
    <div className="md:pl-[252px]">
      <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-border/80 bg-[#f8f6f0]/95 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-3"><button data-testid="button-open-menu" onClick={() => setMobileOpen(true)} className="rounded p-1 text-foreground md:hidden"><Menu size={20}/></button><div className="text-[12px] text-muted-foreground">Coordination / <span className="font-semibold text-foreground">{activeTitle}</span></div></div>
        <div className="flex items-center gap-4"><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[.12em] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#38846e]"/> System mode: demo</div><Link href="/notifications" data-testid="link-header-notifications" className="relative grid h-8 w-8 place-items-center rounded-full text-foreground hover:bg-secondary"><Bell size={17}/><NotificationDot/></Link></div>
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-9 md:py-9">{children}</main>
      <footer className="px-9 pb-7 text-[10px] text-muted-foreground">Coordination record only · No live SAP or HFIR connection is implied.</footer>
    </div>
  </div>;
}

function NotificationCount() {
  const { data } = useListNotifications();
  const unread = data?.filter((n) => !n.read).length ?? 0;
  return unread > 0 ? <span className="ml-auto rounded-full bg-[#e79b5f] px-1.5 py-0.5 text-[9px] font-bold text-[#20343d]">{unread}</span> : null;
}
function NotificationDot() {
  const { data } = useListNotifications();
  return data?.some((n) => !n.read) ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-[#f8f6f0] bg-[#dd8354]"/> : null;
}
function LogoutControl() {
  const { signOut } = useClerk();
  return <button title="Sign out" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="text-white/55 hover:text-white"><LogOut size={15}/></button>;
}

function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.19em] text-primary">{eyebrow}</div><h1 className="font-display text-[30px] font-extrabold tracking-[-.045em] text-foreground sm:text-[37px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>}</div>{action}</div>;
}
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-border bg-card shadow-[0_2px_12px_rgba(42,50,45,.025)] ${className}`}>{children}</section>;
}
function State({ mode, retry }: { mode: 'loading' | 'error' | 'empty'; retry?: () => void }) {
  return mode === 'loading' ? <div className="space-y-3 p-6" aria-label="Loading"><div className="h-4 w-36 animate-pulse rounded bg-muted"/><div className="h-10 animate-pulse rounded bg-muted/75"/><div className="h-10 animate-pulse rounded bg-muted/60"/></div> :
    mode === 'error' ? <div className="flex flex-col items-center gap-3 p-10 text-center"><TriangleAlert className="text-[#b64e42]" size={25}/><div className="font-semibold">Couldn’t load this view</div><p className="text-xs text-muted-foreground">The service did not return data. Nothing has been recorded as successful.</p>{retry && <button className="btn-secondary" onClick={retry} data-testid="button-retry">Try again</button>}</div> :
      <div className="flex flex-col items-center gap-2 p-12 text-center"><PackageOpen size={25} className="text-primary/60"/><div className="font-semibold">Nothing to show yet</div><p className="max-w-sm text-xs text-muted-foreground">Results will appear here after a file is imported or a record is assigned.</p></div>;
}

function Button({ children, onClick, disabled, variant = 'primary', type = 'button', testId }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'quiet'; type?: 'button' | 'submit'; testId: string }) {
  const cls = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : 'btn-quiet';
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={cls}>{children}</button>;
}

function Home() {
  const { isSignedIn } = useUser();
  const me = useGetPortalMe({ query: { queryKey: getGetPortalMeQueryKey(), enabled: !!isSignedIn } });
  if (isSignedIn) return <Redirect to="/dashboard"/>;
  return <div className="min-h-[100dvh] overflow-hidden bg-[#f5f2e9] text-[#20343d]">
    <header className="relative z-10 mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6 lg:px-14">
      <Link href="/" data-testid="link-brand-home" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center bg-[#20343d] text-[#e9a16a]"><HardHat size={19}/></span><span className="font-display text-[13px] font-extrabold tracking-[.06em]">FIELD / DESK</span></Link>
      <div className="flex items-center gap-3"><Link href="/sign-in" data-testid="link-sign-in" className="px-4 py-2 text-xs font-semibold hover:text-primary">Sign in</Link><Link href="/sign-up" data-testid="link-sign-up" className="rounded-sm bg-[#20343d] px-4 py-2.5 text-xs font-semibold text-[#f7f4ec] hover:bg-[#28545b]">Request access <ArrowRight className="ml-2 inline" size={13}/></Link></div>
    </header>
    <section className="relative mx-auto grid max-w-[1440px] gap-10 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_.95fr] lg:px-14 lg:pb-28 lg:pt-20">
      <div className="relative z-10 max-w-[680px]">
        <div className="mb-7 inline-flex items-center gap-2 border border-[#cfc9bd] px-3 py-2 text-[9px] font-semibold uppercase tracking-[.17em] text-[#52666a]"><span className="h-1.5 w-1.5 rounded-full bg-[#d98750]"/> SAP work orders · HFIR rounds · Human handoff</div>
        <h1 className="font-display text-[48px] font-extrabold leading-[.99] tracking-[-.065em] sm:text-[65px] lg:text-[76px]">The handoff<br/>between <span className="text-[#277079]">systems.</span></h1>
        <p className="mt-7 max-w-[480px] text-[15px] leading-[1.8] text-[#647276]">A dependable coordination record for planners and operators preparing inspection work. Bring SAP work orders into focus. Keep HFIR execution where it belongs.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3"><Link href="/sign-in" data-testid="button-enter-portal" className="inline-flex items-center gap-3 bg-[#df9158] px-5 py-3.5 text-xs font-bold text-[#20343d] transition hover:bg-[#e8a16d]">Enter the portal <ArrowRight size={15}/></Link><span className="text-[10px] text-[#78847f]">Sign in with your operations account</span></div>
        {me.data?.bootstrapAvailable && <div className="mt-8 border-l-2 border-[#df9158] pl-4"><div className="text-xs font-semibold">First administrator setup</div><p className="mt-1 text-[11px] text-[#78847f]">Sign in with your account, then claim the portal administrator role.</p><Link href="/sign-in" data-testid="button-bootstrap-admin" className="mt-2 inline-block text-[11px] font-bold text-primary underline underline-offset-4">Sign in to claim administrator access</Link></div>}
      </div>
      <div className="relative mt-4 min-h-[330px] lg:mt-0">
        <div className="absolute right-0 top-0 h-[330px] w-[92%] bg-[#e8e3d7] sm:h-[410px]"/>
        <div className="absolute right-[5%] top-[7%] h-[330px] w-[92%] overflow-hidden bg-[#36545a] p-6 text-[#f4f0e7] sm:h-[410px] sm:p-9">
          <div className="absolute inset-0 opacity-25" style={{backgroundImage:'linear-gradient(90deg, transparent 49.8%, #c8d4c7 50%, transparent 50.2%),linear-gradient(0deg, transparent 49.8%, #c8d4c7 50%, transparent 50.2%)',backgroundSize:'54px 54px'}}/>
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between"><div><div className="text-[9px] uppercase tracking-[.2em] text-white/55">Coordination sequence</div><div className="mt-2 font-display text-xl font-bold">A clear transfer of intent.</div></div><div className="border border-white/25 px-2 py-1 font-mono text-[9px]">FLOW 01</div></div>
            <div className="space-y-3">
              {[['01','SAP source','Imported work order'],['02','Portal handoff','Template + operator + instruction'],['03','HFIR system','Separately scheduled and executed']].map(([n,t,s],i)=><div key={n} className="flex items-center gap-4"><div className={`grid h-9 w-9 place-items-center font-mono text-xs ${i===1?'bg-[#e79b5f] text-[#20343d]':'border border-white/25 text-white/80'}`}>{n}</div><div className="min-w-0 flex-1"><div className="text-[12px] font-bold">{t}</div><div className="text-[10px] text-white/55">{s}</div></div>{i<2&&<ArrowRight size={15} className="text-[#e79b5f]"/>}</div>)}
            </div>
            <div className="flex items-center justify-between border-t border-white/20 pt-4 text-[9px] uppercase tracking-[.14em] text-white/55"><span>No implied live vendor connection</span><span>Auditable by design</span></div>
          </div>
        </div>
        <div className="absolute -bottom-2 left-2 z-10 bg-[#df9158] px-4 py-3 font-mono text-[10px] font-medium text-[#20343d] sm:left-0">SAP ID stays exact. Handoff stays visible.</div>
      </div>
    </section>
    <section className="border-y border-[#d9d3c7] bg-[#eeeae0] px-6 py-12 lg:px-14"><div className="mx-auto grid max-w-[1300px] gap-8 md:grid-cols-3">
      {[['01 / IMPORT','Start with the source','Validate SAP XML, see duplicate records before confirming, and keep the SAP work order identifier untouched.'],['02 / COORDINATE','Make the handoff explicit','Select a round template, assign an operator, and retain the instruction and submitter in the portal record.'],['03 / RECONCILE','Bring results back','Import HFIR results separately. Match exact SAP IDs and make unmatched rounds visible for follow-up.']].map(([eyebrow,title,body])=><div key={title} className="border-t-2 border-[#277079] pt-4"><div className="text-[9px] font-bold tracking-[.17em] text-[#75817c]">{eyebrow}</div><h2 className="mt-3 font-display text-xl font-bold tracking-[-.03em]">{title}</h2><p className="mt-2 max-w-sm text-[12px] leading-relaxed text-[#687675]">{body}</p></div>)}
    </div></section>
    <footer className="mx-auto flex max-w-[1440px] flex-col gap-3 px-6 py-8 text-[10px] text-[#73807c] sm:flex-row sm:justify-between lg:px-14"><span>FIELD / DESK · Inspection Round Coordination · <a className="underline underline-offset-2" href={`${basePath}/integration-guide.md`}>Setup & integration guide</a></span><span>Coordination record only. Scheduling, execution and approval remain in HFIR.</span></footer>
  </div>;
}

function Dashboard() {
  const dash = useGetPortalDashboard();
  const me = useGetPortalMe();
  const qc = useQueryClient();
  const bootstrap = useBootstrapPortalAdmin();
  const metrics = dash.data?.summary ?? {};
  const recent = dash.data?.recentActivity ?? [];
  const includesSharedDemoData = !me.data?.user || me.data.user.role === 'Operator';
  const workOrderMetrics: Array<[string, number, string, typeof ClipboardList]> = [
    ['Imported work orders', metrics.importedWorkOrders ?? 0, 'SAP source records', ClipboardList],
    ['Unmapped work orders', metrics.unmappedWorkOrders ?? 0, 'Awaiting coordination', Link2],
    ['Submitted mappings', metrics.submittedMappings ?? 0, 'Portal handoffs', CheckCircle2],
    ['Awaiting HFIR data', metrics.awaitingHfirData ?? 0, 'No result received yet', FileClock],
  ];
  const roundMetrics: Array<[string, number, string, typeof ClipboardList]> = [
    ['Approved', metrics.approvedRounds ?? 0, 'Approval status', CheckCircle2],
    ['Rejected', metrics.rejectedRounds ?? 0, 'Approval status', TriangleAlert],
    ['Successful', metrics.successfulRounds ?? 0, 'Execution status', Activity],
    ['Incomplete', metrics.incompleteRounds ?? 0, 'Execution status', FileClock],
    ['Overdue', metrics.overdueRounds ?? 0, 'Source-reported overdue', TriangleAlert],
  ];
  if (dash.isLoading) return <State mode="loading"/>;
  if (dash.isError) return <State mode="error" retry={() => dash.refetch()}/>;
  return <div className="page-enter">
     <Heading eyebrow="SAP - HFIR Custom web page" title="Operations Overview" description={`A current view of work order handoffs and imported HFIR rounds${me.data?.user ? ` · ${me.data.user.name}` : ''}.`} action={me.data?.user?.role!=='Operator'?<Link href="/import" data-testid="button-import-sap" className="btn-primary"><Plus size={15}/> Import SAP XML</Link>:undefined}/>
    {includesSharedDemoData && <div className="mb-4 border border-[#d8d2c7] bg-[#f3f0e8] px-4 py-3 text-[10px] leading-relaxed text-muted-foreground" data-testid="notice-shared-demo-data"><span className="font-semibold text-foreground">Shared demo dataset:</span> Overview counts include the 10 simulated sample SAP work orders, plus any real work orders assigned to your account.</div>}
    <div className="mb-7">
      <div className="mb-3 text-[9px] font-bold uppercase tracking-[.18em] text-muted-foreground">Work orders</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{workOrderMetrics.map(([label,value,caption,Icon])=><Card key={label} className="p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className="mt-3 font-display text-[34px] font-extrabold tracking-[-.05em]">{value}</div></div><div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary"><Icon size={17}/></div></div><div className="mt-3 text-[10px] text-muted-foreground">{caption}</div></Card>)}</div>
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-[9px] font-bold uppercase tracking-[.18em] text-muted-foreground">HFIR round results</div><div className="text-[10px] text-muted-foreground">Approval, execution and overdue labels may overlap.</div></div>
    <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{roundMetrics.map(([label,value,caption,Icon])=><Card key={label} className="p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</span><Icon size={15} className="text-primary"/></div><div className="mt-2 font-display text-[30px] font-extrabold tracking-[-.05em]">{value}</div><div className="mt-1 text-[9px] text-muted-foreground">{caption}</div></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="font-display text-[15px] font-bold">Recent handoff activity</div><div className="mt-1 text-[10px] text-muted-foreground">Portal events, newest first</div></div><Link href="/history" data-testid="link-all-history" className="text-[10px] font-bold text-primary">View history <ArrowRight className="ml-1 inline" size={12}/></Link></div>
        {recent.length ? <div className="divide-y divide-border">{recent.slice(0,6).map((entry) => <ActivityRow key={entry.id} entry={entry}/>)}</div> : <State mode="empty"/>}
      </Card>
      <div className="space-y-5">
        <Card className="overflow-hidden"><div className="bg-[#24434a] p-5 text-[#f4f0e7]"><div className="flex items-center justify-between"><div className="text-[9px] uppercase tracking-[.18em] text-white/55">Integration posture</div><ShieldCheck size={17} className="text-[#e79b5f]"/></div><div className="mt-4 grid grid-cols-2 gap-4"><div><div className="text-[10px] text-white/55">SAP</div><div className="mt-1 font-display text-xl font-bold">{dash.data?.integrations?.sapMode || 'Demo'} mode</div></div><div><div className="text-[10px] text-white/55">HFIR</div><div className="mt-1 font-display text-xl font-bold">{dash.data?.integrations?.hfirMode || 'Demo'} mode</div></div></div></div><div className="flex items-start gap-2 p-4 text-[10px] leading-relaxed text-muted-foreground"><CircleHelp size={14} className="mt-0.5 shrink-0 text-primary"/>No live vendor connection is implied. Results enter this portal through imports or the configured adapter.</div></Card>
         {me.data?.bootstrapAvailable && <Card className="p-5"><div className="font-display font-bold">First run setup</div><p className="mt-1 text-xs text-muted-foreground">Claim the initial administrator role to configure portal users and templates.</p><Button testId="button-bootstrap-admin" disabled={bootstrap.isPending} onClick={() => bootstrap.mutate(undefined, {onSuccess: async () => {await qc.invalidateQueries({queryKey:getGetPortalMeQueryKey()});await qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()});}})}>{bootstrap.isPending ? 'Please wait…' : 'Claim administrator'}</Button></Card>}
      </div>
    </div>
  </div>;
}
function ActivityRow({ entry }: { entry: HistoryEntry }) {
  return <div data-testid={`row-activity-${entry.id}`} className="flex items-start gap-3 px-5 py-3.5"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#e79b5f]"/><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{entry.description}</div><div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground"><span className="font-mono">{entry.workOrderNo}</span><span>{entry.actor}</span></div></div><time className="whitespace-nowrap text-[10px] text-muted-foreground">{fmtDate(entry.occurredAt)}</time></div>;
}
function fmtDate(date?: string) {
  if (!date) return '—';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() ?? []).map((header) => header.trim().replace(/^\uFEFF/, ''));
  return rows.filter((values) => values.some((value) => value.trim())).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()])),
  );
}
function fieldValue(record: Record<string, string>, ...keys: string[]): string {
  const byNormalizedKey = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
  for (const key of keys) {
    const found = byNormalizedKey.get(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (found !== undefined) return found;
  }
  return '';
}
function mappingClass(state: string) {
  return state === 'Submitted' ? 'badge-green' : state === 'Draft' ? 'badge-amber' : 'badge-neutral';
}

function WorkOrders() {
  const [search,setSearch] = useState('');
  const [state,setState] = useState('');
  const [sort,setSort] = useState<'due'|'id'>('due');
  const [page,setPage] = useState(1);
  const [selected,setSelected] = useState<WorkOrder|null>(null);
  const params = useMemo(() => ({search: search || undefined, state:state || undefined}),[search,state]);
  const list = useListWorkOrders(params);
  const templates = useListTemplates();
  const qc = useQueryClient();
  const save = useSaveWorkOrderMapping();
  const detail = useGetWorkOrder(selected?.workOrderNo ?? '', {query:{enabled:!!selected,queryKey:getGetWorkOrderQueryKey(selected?.workOrderNo ?? '')}});
  const [templateId,setTemplateId] = useState('');
  const [operatorId,setOperatorId] = useState('');
  const [instructions,setInstructions] = useState(INSTRUCTION);
  const [revisionReason,setRevisionReason] = useState('');
  const [saveNotice,setSaveNotice] = useState('');
  useEffect(() => { if (selected) { setTemplateId(selected.templateId || ''); setOperatorId(selected.operatorId || ''); setInstructions(selected.instructions || INSTRUCTION); setRevisionReason(''); }},[selected]);
  const orders = [...(list.data ?? [])].sort((a,b) => sort === 'due' ? a.dueDate.localeCompare(b.dueDate) : a.workOrderNo.localeCompare(b.workOrderNo));
  const pageSize=10, totalPages=Math.max(1,Math.ceil(orders.length/pageSize)), current=orders.slice((page-1)*pageSize,page*pageSize);
  const saveMapping = (action:'Draft'|'Submit') => {
    if (!selected) return;
     save.mutate({workOrderNo:selected.workOrderNo,data:{action,templateId:templateId||undefined,operatorId:operatorId||undefined,instructions,revisionReason:revisionReason||undefined,idempotencyKey:crypto.randomUUID()}},{onSuccess:(result)=>{qc.invalidateQueries({queryKey:getListWorkOrdersQueryKey(params)});qc.invalidateQueries({queryKey:getListAssignmentsQueryKey()});qc.invalidateQueries({queryKey:getGetWorkOrderQueryKey(selected.workOrderNo)});qc.invalidateQueries({queryKey:getListNotificationsQueryKey()});qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()});qc.invalidateQueries({queryKey:getListTransactionHistoryQueryKey()});setSelected(null);setSaveNotice(result.message??'Mapping saved.');}});
  };
  return <div className="page-enter">
     <Heading eyebrow="SAP source register" title="Imported SAP work orders" description="Search exact SAP IDs, review mapping state and prepare a portal handoff. No scheduling takes place here." action={<Link href="/import" data-testid="button-workorders-import" className="btn-secondary"><Upload size={14}/> Import XML</Link>}/>
      <div className="mb-4 flex items-start gap-3 border border-[#d8d2c7] bg-[#f3f0e8] px-4 py-3" data-testid="notice-sample-work-orders"><Boxes size={16} className="mt-0.5 shrink-0 text-primary"/><div><div className="text-[11px] font-semibold">Demo sample data is preloaded</div><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">The starter dataset includes 10 SAP work orders to explore searching, mapping, and handoffs. These are simulated examples, not live SAP records.</p></div></div>
     {saveNotice&&<div className="mb-4 flex items-center justify-between rounded border border-primary/20 bg-primary/5 px-4 py-3 text-xs" role="status">{saveNotice}<button onClick={()=>setSaveNotice('')} aria-label="Dismiss mapping result"><X size={14}/></button></div>}
     <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
        <label className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input aria-label="Search work orders" data-testid="input-search-work-orders" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search SAP ID, description, asset…" className="field-input pl-9"/></label>
        <select aria-label="Mapping state" data-testid="select-mapping-state" value={state} onChange={e=>{setState(e.target.value);setPage(1)}} className="field-input sm:w-44"><option value="">All mapping states</option><option>Unmapped</option><option>Draft</option><option>Submitted</option></select>
        <button className="btn-secondary" data-testid="button-sort-orders" onClick={()=>setSort(sort==='due'?'id':'due')}><ArrowDownUp size={14}/> Sort: {sort==='due'?'due date':'SAP ID'}</button>
      </div>
      {list.isLoading ? <State mode="loading"/> : list.isError ? <State mode="error" retry={()=>list.refetch()}/> : !orders.length ? <State mode="empty"/> :
        <div className="overflow-x-auto"><table className="w-full min-w-[990px] text-left"><thead><tr className="table-head"><th>SAP work order</th><th>Asset / location</th><th>Plant / priority</th><th>Due</th><th>HFIR template</th><th>Operator / submitted</th><th>Mapping</th><th/></tr></thead><tbody>
          {current.map((wo)=><tr key={wo.workOrderNo} data-testid={`row-work-order-${wo.workOrderNo}`} className="table-row"><td><div className="font-mono text-[11px] font-medium">{wo.workOrderNo}</div><div className="mt-1 max-w-[300px] truncate text-[11px] text-muted-foreground">{wo.description}</div></td><td><div className="text-xs font-semibold">{wo.asset}</div><div className="mt-1 text-[10px] text-muted-foreground">{wo.functionalLocation}</div></td><td><div className="text-[10px]">{wo.plant}</div><span className="badge-neutral">{wo.priority}</span></td><td><div className="text-xs">{fmtDate(wo.dueDate)}</div><div className="mt-1 text-[9px] text-muted-foreground">Planned {fmtDate(wo.plannedStartDate)}</div></td><td>{wo.templateName||'—'}{wo.templateId&&<div className="mt-1 font-mono text-[9px] text-muted-foreground">{wo.templateId}</div>}</td><td><div className="text-[10px]">{wo.operatorName||'—'}</div><div className="mt-1 text-[9px] text-muted-foreground">{wo.submittedAt?fmtDate(wo.submittedAt):'Not submitted'}</div></td><td><span className={mappingClass(wo.mappingState)}>{wo.mappingState}</span></td><td><Button variant="quiet" testId={`button-map-${wo.workOrderNo}`} onClick={()=>setSelected(wo)}>{wo.mappingState==='Unmapped'?'Map':'Review'} <ArrowRight size={13}/></Button></td></tr>)}
        </tbody></table></div>}
      <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-[10px] text-muted-foreground">{orders.length ? `${(page-1)*pageSize+1}–${Math.min(page*pageSize,orders.length)} of ${orders.length}` : '0 records'}</span><div className="flex gap-1"><button disabled={page<=1} onClick={()=>setPage(page-1)} data-testid="button-page-previous" className="pager"><ChevronLeft size={14}/></button><span className="px-2 py-1 text-[10px]">Page {page} / {totalPages}</span><button disabled={page>=totalPages} onClick={()=>setPage(page+1)} data-testid="button-page-next" className="pager"><ChevronRight size={14}/></button></div></div>
    </Card>
    {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17272e]/55 p-4"><div className="max-h-[92dvh] w-full max-w-[620px] overflow-auto rounded-lg border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between border-b border-border p-5"><div><div className="text-[9px] font-bold uppercase tracking-[.16em] text-primary">Prepare handoff</div><h2 className="mt-1 font-display text-xl font-bold">{selected.workOrderNo}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.description}</p></div><button onClick={()=>setSelected(null)} data-testid="button-close-mapping" className="text-muted-foreground"><X size={18}/></button></div>
      <div className="space-y-4 p-5">
        {detail.isLoading && <div className="text-xs text-muted-foreground">Loading record history…</div>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="field-label">HFIR template<select className="field-input mt-1" value={templateId} onChange={e=>setTemplateId(e.target.value)} data-testid="select-template"><option value="">Select template</option>{templates.data?.templates?.filter(t=>t.active).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label className="field-label">Assigned operator<select className="field-input mt-1" value={operatorId} onChange={e=>setOperatorId(e.target.value)} data-testid="select-operator"><option value="">Select operator</option>{templates.data?.operators?.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label></div>
        <label className="field-label">Operator instruction<textarea className="field-input mt-1 min-h-[78px] resize-y" value={instructions} onChange={e=>setInstructions(e.target.value)} data-testid="input-operator-instruction"/></label>
         {selected.mappingState==='Submitted'&&<label className="field-label">Reason for revising this submitted mapping<textarea className="field-input mt-1 min-h-[65px]" value={revisionReason} onChange={e=>setRevisionReason(e.target.value)} data-testid="input-mapping-revision-reason" placeholder="Required when changing the active assignment"/></label>}
        <div className="border-l-2 border-[#de965f] bg-secondary/60 p-3 text-[11px] leading-relaxed text-foreground"><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-primary">Manual handoff — no HFIR action here</span>{INSTRUCTION}</div>
        {detail.data?.history?.length ? <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Record timeline</div><div className="space-y-2">{detail.data.history.slice(0,3).map(h=><div key={h.id} className="flex justify-between text-[10px]"><span>{h.description}</span><span className="text-muted-foreground">{fmtDate(h.occurredAt)}</span></div>)}</div></div> : null}
        {save.isError && <div className="text-xs text-destructive">Could not save mapping. Review the record and retry.</div>}
      </div>
       <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4"><Button variant="secondary" testId="button-save-draft" disabled={save.isPending || selected.mappingState==='Submitted'} onClick={()=>saveMapping('Draft')}>Save draft</Button><Button testId="button-submit-handoff" disabled={save.isPending || !templateId || !operatorId || (selected.mappingState==='Submitted'&&!revisionReason.trim())} onClick={()=>saveMapping('Submit')}>{save.isPending?'Saving…':selected.mappingState==='Submitted'?'Revise & notify operator':'Submit handoff'} <ArrowRight size={14}/></Button></div>
    </div></div>}
  </div>;
}

function ImportPage() {
  const [file,setFile] = useState<File|null>(null);
  const [xml,setXml] = useState('');
  const [preview,setPreview] = useState<any|null>(null);
  const [confirmed,setConfirmed] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const imp=useImportWorkOrders(); const qc=useQueryClient();
  const readFile=async(f:File)=>{if(!f.name.toLowerCase().endsWith('.xml')){setFile(null);setXml('');setError('Choose an XML file.');return;}if(f.size>5*1024*1024){setFile(null);setXml('');setError('The file is larger than the 5 MB limit.');return;}setFile(f);setPreview(null);setConfirmed(false);setError('');setXml(await f.text());};
  const validate=async()=>{if(!file||!xml)return;setBusy(true);setError('');try{const result=await imp.mutateAsync({data:{filename:file.name,xml,confirm:false}});setPreview(result);}catch{setError('Validation failed. The file was not imported. Check the XML structure and retry.');}finally{setBusy(false);}};
  const confirm=async()=>{if(!file||!xml)return;setBusy(true);setError('');try{const result=await imp.mutateAsync({data:{filename:file.name,xml,confirm:true}});setPreview(result);setConfirmed(true);qc.invalidateQueries({queryKey:getListWorkOrdersQueryKey()});qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()});qc.invalidateQueries({queryKey:getListTransactionHistoryQueryKey()});}catch{setError('Import did not complete successfully. The batch may not have been committed; inspect history before retrying.');}finally{setBusy(false);}};
  const fileChange=(e:ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(f)void readFile(f);};
  const fileDrop=(e:DragEvent<HTMLLabelElement>)=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f)void readFile(f);};
  return <div className="page-enter"><Heading eyebrow="Source ingestion" title="Import SAP work orders" description="Load an SAP XML export, validate the records, inspect duplicates and errors, then explicitly confirm the batch."/>
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
       <Card className="p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary"><FileUp size={17}/></div><div><h2 className="font-display font-bold">Upload XML file</h2><p className="text-[10px] text-muted-foreground">SAP export · XML format</p></div></div>
         <label onDragOver={(e)=>e.preventDefault()} onDrop={fileDrop} className="flex min-h-[190px] cursor-pointer flex-col items-center justify-center border border-dashed border-[#aeb8b2] bg-[#f6f4ed] px-4 text-center transition hover:border-primary" data-testid="dropzone-sap-xml"><Upload size={23} className="mb-3 text-primary"/><span className="text-sm font-semibold">{file?.name || 'Choose a file or drop it here'}</span><span className="mt-1 text-[10px] text-muted-foreground">XML only · maximum 5 MB · preview required before confirmation</span><input type="file" accept=".xml,text/xml,application/xml" onChange={fileChange} data-testid="input-sap-xml" className="sr-only"/></label>
         <a className="mt-3 inline-block text-[10px] font-semibold text-primary underline" href={`${basePath}/samples/sap-work-orders.xml`} download>Download sample SAP XML</a>
        {file && <div className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>{file.name}</span><span>{(file.size/1024).toFixed(1)} KB</span></div>}
        {error&&<div className="mt-4 rounded border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</div>}
        <div className="mt-5 flex flex-wrap gap-2"><Button testId="button-validate-import" disabled={!file||busy} onClick={validate}>{busy?<LoaderCircle className="animate-spin" size={15}/>:<Check size={15}/>} Validate records</Button>{preview&&<Button variant="secondary" testId="button-confirm-import" disabled={busy} onClick={confirm}>{busy?'Importing…':'Confirm import'} <ArrowRight size={14}/></Button>}</div>
        <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">The confirmation step writes a batch to the portal. SAP itself is not updated.</p>
      </Card>
      <div className="space-y-4">
        {preview ? <><Card><div className="border-b border-border p-5"><div className="text-[9px] font-bold uppercase tracking-[.17em] text-primary">{confirmed?'Import confirmation':'Validation preview'}</div><div className="mt-1 flex flex-wrap items-end justify-between gap-2"><h2 className="font-display text-xl font-bold">{preview.batchId ? `Batch ${preview.batchId}` : 'Import preview'}</h2><span className={`text-[10px] ${confirmed?'font-semibold text-[#347451]':'text-muted-foreground'}`}>{confirmed?'Batch import completed': 'No records are committed until confirmed'}</span></div></div><div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">{[['Accepted',preview.accepted],['Duplicates',preview.duplicates],['Updated',preview.updated],['Rejected',preview.rejected]].map(([label,value])=><div key={String(label)} className="p-4"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-display text-2xl font-bold">{value as number}</div></div>)}</div>
           {preview.preview?.length ? <div className="border-t border-border p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider">Preview records</div><div className="overflow-auto"><table className="w-full text-left text-[10px]"><thead><tr className="table-head"><th>SAP identifier</th><th>Record status</th><th>Preview detail</th></tr></thead><tbody>{preview.preview.map((row:any,i:number)=><tr key={i} className="table-row"><td className="font-mono">{String(row.workOrderNo ?? row.sapId ?? '—')}</td><td>{String(row.action ?? row.status ?? row.mappingState ?? 'Ready')}</td><td>{String(row.description ?? row.message ?? '—')}</td></tr>)}</tbody></table></div></div>:null}
          {preview.errors?.length>0&&<div className="border-t border-border p-4"><div className="mb-2 text-[10px] font-bold text-destructive">Validation messages</div>{preview.errors.map((e:string,i:number)=><div key={i} className="text-[10px] text-muted-foreground">{e}</div>)}</div>}
        </Card></> : <Card className="min-h-[280px]"><div className="flex h-full min-h-[280px] flex-col justify-center p-7"><div className="mb-5 flex h-12 w-12 items-center justify-center border border-border text-primary"><Boxes size={21}/></div><div className="font-display text-lg font-bold">Review before you commit</div><p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">Validation returns candidate records and duplicate counts. Confirm only after the preview matches your expected SAP export.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{[['01','Select XML'],['02','Validate & inspect'],['03','Confirm the batch']].map(([n,t])=><div key={n} className="border-t border-border pt-2"><div className="font-mono text-[9px] text-primary">{n}</div><div className="mt-1 text-[10px] font-semibold">{t}</div></div>)}</div></div></Card>}
      </div>
    </div>
  </div>;
}

function Assignments() {
  const q=useListAssignments(); const templates=useListTemplates(); const dashboard=useGetPortalDashboard();
   return <div className="page-enter"><Heading eyebrow="Operator queue" title="Assignments" description="Submitted portal handoffs for the current operator. Assignment is separate from HFIR scheduling and round execution."/>
     {q.isLoading?<Card><State mode="loading"/></Card>:q.isError?<Card><State mode="error" retry={()=>q.refetch()}/></Card>:!q.data?.length?<Card><State mode="empty"/></Card>:<div className="grid gap-4 lg:grid-cols-2">{q.data.map(wo=><Card key={wo.workOrderNo} className="overflow-hidden"><div className="flex items-start justify-between border-b border-border p-5"><div><div className="font-mono text-[10px] text-primary">{wo.workOrderNo}</div><h2 className="mt-1 font-display text-lg font-bold">{wo.description}</h2><div className="mt-2 text-[11px] text-muted-foreground">{wo.asset} · {wo.functionalLocation || wo.plant}</div></div><span className="badge-green">Submitted</span></div><div className="grid grid-cols-2 gap-4 p-5"><div><div className="field-caption">Template</div><div className="mt-1 text-xs font-semibold">{wo.templateName || templates.data?.templates?.find(t=>t.id===wo.templateId)?.name || '—'}</div><div className="mt-1 font-mono text-[9px] text-muted-foreground">{wo.templateId}</div></div><div><div className="field-caption">Assigned operator</div><div className="mt-1 text-xs font-semibold">{wo.operatorName || '—'}</div></div><div><div className="field-caption">Due date</div><div className="mt-1 text-xs">{fmtDate(wo.dueDate)}</div></div><div><div className="field-caption">Submitted</div><div className="mt-1 text-xs">{wo.submittedAt?new Date(wo.submittedAt).toLocaleString():'—'}</div></div></div>{wo.instructions&&<div className="mx-5 mb-3 border-l-2 border-border bg-secondary/50 p-3 text-[10px] leading-relaxed"><b>Assignment instructions:</b> {wo.instructions}</div>}<div className="mx-5 mb-3 border-l-2 border-[#dc945a] bg-secondary/60 p-3 text-[10px] leading-relaxed"><span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-primary">Required manual instruction</span>{INSTRUCTION}</div><div className="flex flex-wrap items-center gap-2 px-5 pb-4"><Button variant="secondary" testId={`button-copy-assignment-${wo.workOrderNo}`} onClick={()=>void navigator.clipboard?.writeText(wo.workOrderNo)}>Copy work order number</Button>{dashboard.data?.integrations.openHfirUrl?<a className="btn-quiet text-[10px]" href={dashboard.data.integrations.openHfirUrl} target="_blank" rel="noreferrer">Open HFIR <ArrowRight size={12}/></a>:<span className="text-[9px] text-muted-foreground">HFIR link not configured</span>}</div><div className="px-5 pb-4 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">No round is scheduled by this assignment.</div></Card>)}</div>}
  </div>;
}

function statusValue(value: string | undefined) {
  const accepted=['Scheduled','In Progress','Completed','Successful','Incomplete','Approved','Rejected','Pending','Overdue','Awaiting approval'];
  return !value ? 'Unknown' : accepted.includes(value) ? value : 'Unknown';
}
function Rounds() {
  const me=useGetPortalMe();
  const q=useListRounds({query:{queryKey:getListRoundsQueryKey(),enabled:me.isSuccess,refetchOnMount:'always'},request:{cache:'no-store'}}); const admin=useGetPortalAdmin({query:{queryKey:getGetPortalAdminQueryKey(),enabled:me.data?.user?.role==='Administrator'}});
  const rounds=q.data??[]; const unmatched=admin.data?.unmatched??[];
  return <div className="page-enter"><Heading eyebrow="HFIR result reconciliation" title="Round executions" description="Imported HFIR execution data only. This portal has no schedule, execute or approve controls." action={me.data?.user?.role==='Administrator'?<ImportRoundsButton/>:undefined}/>
    <Card className="mb-5"><div className="flex items-start gap-3 border-l-2 border-[#de965f] bg-secondary/45 p-4 text-[11px] leading-relaxed"><CircleHelp size={15} className="mt-0.5 shrink-0 text-primary"/><span>Round status is kept separate from mapping status. No-result is shown as <b>Awaiting HFIR data</b>; unfamiliar vendor values are shown as <b>Unknown</b>. PDF attachments are available only for rounds that are <b>Approved</b> or <b>Successful</b>. “Submit to SAP” queues the status in this portal only; it does not send data to SAP.</span></div></Card>
     {(!me.data?.user || me.data.user.role==='Operator')&&<div className="mb-5 border border-[#d8d2c7] bg-[#f3f0e8] px-4 py-3 text-[10px] leading-relaxed text-muted-foreground" data-testid="notice-shared-demo-rounds"><span className="font-semibold text-foreground">Shared demo results:</span> Sample HFIR round records are shown for preview. Any non-demo rounds remain limited to your operator assignments.</div>}
    {q.isLoading?<Card><State mode="loading"/></Card>:q.isError?<Card><State mode="error" retry={()=>q.refetch()}/></Card>:!rounds.length&&!unmatched.length?<Card><div className="p-2"><State mode="empty"/></div><div className="border-t border-border px-5 py-4 text-center text-xs font-semibold text-muted-foreground">Awaiting HFIR data</div></Card>:<div className="space-y-5">
       {!!unmatched.length&&<Card><div className="flex items-center gap-2 border-b border-border p-4"><TriangleAlert size={16} className="text-[#b04d40]"/><h2 className="font-display font-bold">Unmatched HFIR rounds</h2><span className="badge-amber">{unmatched.length}</span></div><div className="overflow-x-auto"><div className="md:min-w-[1160px]"><RoundTableHeader/><div className="divide-y divide-border">{unmatched.map(r=><RoundRow key={r.id} round={r} unmatched/>)}</div></div></div></Card>}
       <Card><div className="flex items-center justify-between border-b border-border p-4"><h2 className="font-display font-bold">Linked execution records</h2><span className="text-[10px] text-muted-foreground">{rounds.length} imported records</span></div>{rounds.length?<div className="overflow-x-auto"><div className="md:min-w-[1160px]"><RoundTableHeader/><div className="divide-y divide-border">{rounds.map(r=><RoundRow key={r.id} round={r}/>)}</div></div></div>:<State mode="empty"/>}</Card>
    </div>}
  </div>;
}
function RoundRow({round:r,unmatched=false}:{round:RoundExecution;unmatched?:boolean}) {
  const status=statusValue(r.executionStatus);
  const qc=useQueryClient();
  const uploadUrl=useRequestRoundAttachmentUploadUrl();
  const completeUpload=useCompleteRoundAttachmentUpload();
  const queueStatus=useQueueRoundStatusForSap();
  const [attachmentError,setAttachmentError]=useState('');
  const [queueError,setQueueError]=useState('');
  const attachments=r.attachments??[];
  const attachmentEligible=r.approvalStatus.toLowerCase()==='approved'||r.executionStatus.toLowerCase()==='successful';
  const refreshRoundViews=async()=>Promise.all([
    qc.invalidateQueries({queryKey:getListRoundsQueryKey()}),
    qc.invalidateQueries({queryKey:getListTransactionHistoryQueryKey()}),
    qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()}),
  ]);
  const handlePdfChange=async(event:ChangeEvent<HTMLInputElement>)=>{
    const input=event.currentTarget;
    const file=input.files?.[0];
    input.value='';
    if(!file)return;
    setAttachmentError('');
    if(!/\.pdf$/i.test(file.name)||file.size===0||file.size>25*1024*1024){
      setAttachmentError('Choose a PDF file no larger than 25 MB.');
      return;
    }
    try{
      const signed=await uploadUrl.mutateAsync({roundId:r.id,data:{fileName:file.name,sizeBytes:file.size,contentType:'application/pdf'}});
      const response=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:file,cache:'no-store'});
      if(!response.ok)throw new Error('PDF upload failed.');
      await completeUpload.mutateAsync({roundId:r.id,attachmentId:signed.id});
      await refreshRoundViews();
    }catch{
      setAttachmentError('Could not upload this PDF. Check the file and try again.');
    }
  };
  const handleQueueStatus=async()=>{
    setQueueError('');
    try{
      await queueStatus.mutateAsync({roundId:r.id});
      await refreshRoundViews();
    }catch{
      setQueueError('Could not queue this status. Try again.');
    }
  };
  const attachmentBusy=uploadUrl.isPending||completeUpload.isPending;
  return <div data-testid={`row-round-${r.id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[.85fr_1.05fr_.9fr_1fr_.85fr_1fr_1fr] md:items-start">
    <div data-testid={`cell-sap-work-order-${r.id}`}><div className="field-caption">SAP work order number</div><div className="mt-1 font-mono text-[11px] font-medium">{r.workOrderNo||'—'}</div>{unmatched&&<span className="mt-1 inline-flex badge-amber">Unmatched</span>}</div>
    <div><div className="field-caption">HFIR template / operator</div><div className="mt-1 text-xs font-semibold">{r.templateName||'Unknown template'}</div><div className="mt-1 font-mono text-[9px] text-muted-foreground">{r.templateId}</div><div className="mt-1 text-[10px] text-muted-foreground">{r.operatorName||'—'}</div></div>
    <div><div className="field-caption">Execution / approval</div><div className="mt-1 flex flex-wrap gap-1.5"><span className={status==='Unknown'?'badge-amber':'badge-neutral'}>{status}</span><span className="badge-neutral">{statusValue(r.approvalStatus)}</span></div></div>
    <div><div className="field-caption">Scheduled / due / completed</div><div className="mt-1 text-[10px]">{fmtDate(r.scheduledDate)} / {fmtDate(r.dueDate)} / {fmtDate(r.completedAt)}</div></div>
    <div><div className="field-caption">Overdue / source status</div><div className="mt-1 text-[10px]">{r.overdue||'Unknown'}</div><div className="mt-1 text-[9px]">Raw: <span className="font-mono">{r.rawStatus||'Unknown'}</span></div><div className="mt-1 text-[9px] text-muted-foreground">Last sync {new Date(r.lastSyncAt).toLocaleString()}</div>{r.rejectionReason&&<div className="mt-1 text-[9px] text-destructive">{r.rejectionReason}</div>}</div>
    <div data-testid={`cell-round-attachment-${r.id}`}><div className="field-caption">Attachment</div>{attachmentEligible?<><div className="mt-1 space-y-1">{attachments.map((file:RoundAttachment)=><a key={file.id} className="block break-all text-[10px] font-semibold text-primary underline" href={file.fileUrl} data-testid={`link-round-attachment-${file.id}`}>{file.fileName}</a>)}</div><label className={`btn-secondary mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[9px] ${attachmentBusy?'pointer-events-none opacity-60':''}`}><FileUp size={12}/>{attachmentBusy?'Uploading…':'Upload PDF'}<input className="sr-only" type="file" accept="application/pdf,.pdf" disabled={attachmentBusy} onChange={event=>void handlePdfChange(event)} data-testid={`input-round-attachment-${r.id}`}/></label>{attachmentError&&<div className="mt-1 text-[9px] text-destructive">{attachmentError}</div>}</>:<div className="mt-1 text-[9px] text-muted-foreground">Available after approval or success</div>}</div>
    <div data-testid={`cell-round-sap-submit-${r.id}`}><div className="field-caption">Submit to SAP</div>{r.sapSubmissionStatus==='Queued'?<><span className="mt-1 inline-flex badge-amber">Queued</span><div className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Portal only; not sent to SAP.</div>{r.sapQueuedAt&&<div className="mt-1 text-[9px] text-muted-foreground">{new Date(r.sapQueuedAt).toLocaleString()}</div>}</>:<button type="button" className="btn-secondary mt-1 text-[9px]" disabled={!r.workOrderNo||queueStatus.isPending} onClick={()=>void handleQueueStatus()} data-testid={`button-submit-round-${r.id}`}>{queueStatus.isPending?'Queueing…':'Submit to SAP'}</button>}{!r.workOrderNo&&<div className="mt-1 text-[9px] text-muted-foreground">No matched SAP work order</div>}{queueError&&<div className="mt-1 text-[9px] text-destructive">{queueError}</div>}</div>
  </div>;
}
function RoundTableHeader() {
  return <div className="hidden grid-cols-[.85fr_1.05fr_.9fr_1fr_.85fr_1fr_1fr] gap-3 border-b border-border bg-secondary/40 px-5 py-2 text-[9px] font-bold uppercase tracking-[.1em] text-muted-foreground md:grid">
    <div>SAP work order number</div><div>HFIR template / operator</div><div>Execution / approval</div><div>Scheduled / due / completed</div><div>Overdue / source status</div><div>Attachment</div><div>Submit to SAP</div>
  </div>;
}
function ImportRoundsButton() {
  const [open,setOpen]=useState(false); const [file,setFile]=useState<File|null>(null); const [json,setJson]=useState(''); const [error,setError]=useState('');
  const imp=useImportHfirResults(); const qc=useQueryClient();
  const submit=async()=>{if(!file)return;try{const parsed=file.name.toLowerCase().endsWith('.csv')?parseCsv(json):JSON.parse(json);if(!Array.isArray(parsed))throw new Error();const rounds:RoundImportRecord[]=parsed.map((source:Record<string,unknown>,index:number)=>{const row=Object.fromEntries(Object.entries(source).map(([key,value])=>[key,String(value??'')])) as Record<string,string>;const workOrderNo=fieldValue(row,'workOrderNo','sapWorkOrderNo','sapWorkOrderNumber','orderNumber');return{id:fieldValue(row,'id','roundInstanceId','roundId')||undefined,sourceRoundId:fieldValue(row,'sourceRoundId','roundInstanceId','roundId','id')||``,workOrderNo:workOrderNo||null,sapWorkOrderNo:workOrderNo||null,templateId:fieldValue(row,'templateId','hfirTemplateId'),templateName:fieldValue(row,'templateName','hfirTemplateName'),operatorId:fieldValue(row,'operatorId'),operatorName:fieldValue(row,'operatorName','operator'),scheduledDate:fieldValue(row,'scheduledDate','scheduledAt'),dueDate:fieldValue(row,'dueDate'),completedAt:fieldValue(row,'completedAt','completionTimestamp'),executionStatus:fieldValue(row,'executionStatus'),approvalStatus:fieldValue(row,'approvalStatus'),overdue:fieldValue(row,'overdue','overdueIndicator'),rawStatus:fieldValue(row,'rawStatus','status'),sourceTimestamp:fieldValue(row,'sourceTimestamp','updatedAt','lastSyncAt'),rejectionReason:fieldValue(row,'rejectionReason','comments')};});await imp.mutateAsync({data:{filename:file.name,rounds}});qc.invalidateQueries({queryKey:getListRoundsQueryKey()});qc.invalidateQueries({queryKey:getGetPortalAdminQueryKey()});qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()});qc.invalidateQueries({queryKey:getListTransactionHistoryQueryKey()});setOpen(false);setError('');}catch{setError('Could not import. Supply a JSON array or CSV with sourceRoundId and optional SAP work order number.');}};
  return <><Button variant="secondary" testId="button-import-hfir" onClick={()=>setOpen(true)}><Upload size={14}/> Import HFIR results</Button>{open&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17272e]/55 p-4"><Card className="w-full max-w-lg p-5"><div className="flex justify-between"><div><h3 className="font-display text-lg font-bold">Import HFIR result file</h3><p className="mt-1 text-xs text-muted-foreground">Use the approved adapter export. This portal does not schedule or execute rounds.</p><a className="mt-2 inline-block text-[10px] font-semibold text-primary underline" href={`${basePath}/samples/hfir-results.csv`} download>Download sample CSV</a></div><button onClick={()=>setOpen(false)} data-testid="button-close-round-import"><X size={17}/></button></div><input className="field-input mt-4" type="file" accept=".json,.csv,application/json,text/csv" data-testid="input-hfir-json" onChange={async e=>{const f=e.target.files?.[0];if(f){setFile(f);setJson(await f.text());}}}/><textarea className="field-input mt-3 min-h-40 font-mono text-[10px]" value={json} onChange={e=>setJson(e.target.value)} placeholder='[{"sourceRoundId":"RND-001","workOrderNo":"0000417823","rawStatus":"COMPLETED"}]' data-testid="input-hfir-results-json"/>{error&&<p className="mt-2 text-xs text-destructive">{error}</p>}<div className="mt-4 flex justify-end"><Button testId="button-submit-hfir-import" disabled={!file||imp.isPending} onClick={submit}>{imp.isPending?'Importing…':'Import results'}</Button></div></Card></div>}</>;
}

function History() {
  const [filters,setFilters]=useState({search:'',asset:'',plant:'',template:'',operatorId:'',state:'',importedFrom:'',importedTo:'',submittedFrom:'',submittedTo:''});
  const [eventType,setEventType]=useState('');
  const update=(key:keyof typeof filters,value:string)=>setFilters((current)=>({...current,[key]:value}));
  const params=useMemo(()=>({
    search:filters.search||undefined,
    asset:filters.asset||undefined,
    plant:filters.plant||undefined,
    template:filters.template||undefined,
    operatorId:filters.operatorId||undefined,
    state:filters.state||undefined,
    importedFrom:filters.importedFrom||undefined,
    importedTo:filters.importedTo||undefined,
    submittedFrom:filters.submittedFrom||undefined,
    submittedTo:filters.submittedTo||undefined,
  }),[filters]);
  const q=useListTransactionHistory(params);
  const templates=useListTemplates();
  const exp=useExportTransactionHistory(params,{query:{enabled:false,queryKey:getExportTransactionHistoryQueryKey(params)}});
  const [exportError,setExportError]=useState('');
  const records=(q.data??[]).filter(e=>!eventType||e.type===eventType);
  const exportCsv=async()=>{setExportError('');try{const res=await exp.refetch();if(res.isError||typeof res.data!=='string')throw new Error();const blob=new Blob([res.data],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='inspection-handoff-history.csv';a.click();URL.revokeObjectURL(url);}catch{setExportError('CSV export failed. No file was downloaded.');}};
  return <div className="page-enter"><Heading eyebrow="Audit trail" title="Handoff history" description="A searchable timeline of recorded portal actions. Export a CSV snapshot for your operational record." action={<Button variant="secondary" testId="button-export-history" disabled={exp.isFetching} onClick={exportCsv}>{exp.isFetching?<LoaderCircle size={14} className="animate-spin"/>:<Download size={14}/>} Export CSV</Button>}/>
    <Card><div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="field-label">Search<input className="field-input mt-1" value={filters.search} onChange={e=>update('search',e.target.value)} placeholder="SAP ID or description" data-testid="input-history-search"/></label>
      <label className="field-label">Asset<input className="field-input mt-1" value={filters.asset} onChange={e=>update('asset',e.target.value)} data-testid="input-history-asset"/></label>
      <label className="field-label">Plant / site<input className="field-input mt-1" value={filters.plant} onChange={e=>update('plant',e.target.value)} data-testid="input-history-plant"/></label>
      <label className="field-label">HFIR template<select className="field-input mt-1" value={filters.template} onChange={e=>update('template',e.target.value)} data-testid="select-history-template"><option value="">All templates</option>{templates.data?.templates.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select></label>
      <label className="field-label">Operator<select className="field-input mt-1" value={filters.operatorId} onChange={e=>update('operatorId',e.target.value)} data-testid="select-history-operator"><option value="">All operators</option>{templates.data?.operators.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="field-label">Mapping state<select className="field-input mt-1" value={filters.state} onChange={e=>update('state',e.target.value)} data-testid="select-history-state"><option value="">All states</option><option>Unmapped</option><option>Draft</option><option>Submitted</option></select></label>
      <label className="field-label">Imported from<input type="date" className="field-input mt-1" value={filters.importedFrom} onChange={e=>update('importedFrom',e.target.value)} data-testid="input-history-imported-from"/></label>
      <label className="field-label">Imported to<input type="date" className="field-input mt-1" value={filters.importedTo} onChange={e=>update('importedTo',e.target.value)} data-testid="input-history-imported-to"/></label>
      <label className="field-label">Submitted from<input type="date" className="field-input mt-1" value={filters.submittedFrom} onChange={e=>update('submittedFrom',e.target.value)} data-testid="input-history-submitted-from"/></label>
      <label className="field-label">Submitted to<input type="date" className="field-input mt-1" value={filters.submittedTo} onChange={e=>update('submittedTo',e.target.value)} data-testid="input-history-submitted-to"/></label>
      <label className="field-label">Event type<select className="field-input mt-1" value={eventType} onChange={e=>setEventType(e.target.value)} aria-label="Filter history event type" data-testid="select-history-type"><option value="">All event types</option>{[...new Set((q.data??[]).map(e=>e.type))].map(type=><option key={type} value={type}>{type}</option>)}</select></label>
      <div className="flex items-end"><button className="btn-quiet text-[10px]" data-testid="button-clear-history-filters" onClick={()=>{setFilters({search:'',asset:'',plant:'',template:'',operatorId:'',state:'',importedFrom:'',importedTo:'',submittedFrom:'',submittedTo:''});setEventType('');}}>Clear filters</button></div>
    </div>{exportError&&<p className="px-4 pt-3 text-xs text-destructive">{exportError}</p>}
      {q.isLoading?<State mode="loading"/>:q.isError?<State mode="error" retry={()=>q.refetch()}/>:!records.length?<State mode="empty"/>:<div className="divide-y divide-border">{records.map(e=><div key={e.id} data-testid={`timeline-event-${e.id}`} className="relative grid gap-3 px-5 py-4 sm:grid-cols-[145px_1fr_160px]"><div className="font-mono text-[10px] text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</div><div className="relative border-l border-border pl-5"><span className="absolute -left-[4px] top-1 h-2 w-2 rounded-full bg-primary"/><div className="text-xs font-semibold">{e.description}</div><div className="mt-1 text-[10px] text-muted-foreground">{e.type} · SAP <span className="font-mono">{e.workOrderNo}</span></div></div><div className="text-[10px] text-muted-foreground">{e.actor}</div></div>)}</div>}
    </Card>
  </div>;
}

function Notifications() {
  const q=useListNotifications(); const mark=useMarkNotificationRead(); const qc=useQueryClient();
  const dashboard=useGetPortalDashboard();
  const [filter,setFilter]=useState<'all'|'unread'>('all');
  const items=(q.data??[]).filter(n=>filter==='all'||!n.read);
  return <div className="page-enter"><Heading eyebrow="Persistent portal notices" title="Notifications" description="Submitted handoffs are surfaced here for operators. Read state persists with the portal record."/>
    <Card><div className="flex items-center justify-between border-b border-border p-4"><div className="flex gap-2"><button onClick={()=>setFilter('all')} data-testid="filter-notifications-all" className={filter==='all'?'filter-tab active':'filter-tab'}>All</button><button onClick={()=>setFilter('unread')} data-testid="filter-notifications-unread" className={filter==='unread'?'filter-tab active':'filter-tab'}>Unread <span className="ml-1 rounded bg-secondary px-1.5">{q.data?.filter(n=>!n.read).length??0}</span></button></div></div>
      {q.isLoading?<State mode="loading"/>:q.isError?<State mode="error" retry={()=>q.refetch()}/>:!items.length?<State mode="empty"/>:<div className="divide-y divide-border">{items.map(n=><div key={n.id} data-testid={`notification-${n.id}`} className={`flex flex-col gap-4 px-5 py-4 sm:flex-row ${n.read?'opacity-70':'bg-[#f7f4ec]'}`}><div className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.read?'bg-secondary text-muted-foreground':'bg-[#f1e1d0] text-[#995b30]'}`}><Bell size={15}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-xs font-bold">{n.description}</div>{n.notificationType==='Template mapping'&&<span className="badge-neutral">Template mapping</span>}{!n.read&&<span className="badge-amber">New</span>}</div><div className="mt-1 text-[10px] text-muted-foreground">SAP <span className="font-mono">{n.workOrderNo}</span> · {n.asset} · {n.templateName} <span className="font-mono">({n.templateId})</span></div>{n.instructions&&<div className="mt-2 text-[10px] leading-relaxed"><b>{n.notificationType==='Template mapping'?'Mapping note:':'Assignment instructions:'}</b> {n.instructions}</div>}{n.notificationType==='Template mapping'?<div className="mt-2 border-l-2 border-[#dc945a] bg-secondary/60 p-3 text-[10px] leading-relaxed"><b className="mb-1 block text-[9px] uppercase tracking-wider text-primary">Mapping confirmation</b>This SAP work order is linked to the HFIR template shown above. Round scheduling and execution remain in HFIR.</div>:<div className="mt-2 border-l-2 border-[#dc945a] bg-secondary/60 p-3 text-[10px] leading-relaxed"><b className="mb-1 block text-[9px] uppercase tracking-wider text-primary">Required manual instruction</b>{INSTRUCTION}</div>}<div className="mt-2 text-[9px] text-muted-foreground">Submitted by {n.submitter} · Due {fmtDate(n.dueDate)} · Submitted {new Date(n.createdAt).toLocaleString()}</div><div className="mt-3 flex flex-wrap items-center gap-2"><Button variant="secondary" testId={`button-copy-notification-${n.id}`} onClick={()=>void navigator.clipboard?.writeText(n.workOrderNo)}>Copy work order number</Button>{dashboard.data?.integrations.openHfirUrl?<a className="btn-quiet text-[10px]" href={dashboard.data.integrations.openHfirUrl} target="_blank" rel="noreferrer">Open HFIR <ArrowRight size={12}/></a>:<span className="text-[9px] text-muted-foreground">HFIR link not configured</span>}</div></div>{!n.read&&<Button variant="quiet" testId={`button-mark-read-${n.id}`} disabled={mark.isPending} onClick={()=>mark.mutate({notificationId:n.id},{onSuccess:()=>{qc.invalidateQueries({queryKey:getListNotificationsQueryKey()});qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()});}})}>Mark read <Check size={13}/></Button>}</div>)}</div>}
    </Card>
  </div>;
}

function Admin() {
  const q=useGetPortalAdmin();
  const role=useUpdatePortalUserRole(), settings=useUpdatePortalSettings(), importTemplates=useImportTemplates();
  const qc=useQueryClient();
  const [url,setUrl]=useState(''); const [timezone,setTimezone]=useState(''); const [syncError,setSyncError]=useState('');
  const [templateFile,setTemplateFile]=useState<File|null>(null); const [templateJson,setTemplateJson]=useState(''); const [message,setMessage]=useState('');
  useEffect(()=>{if(q.data){setUrl(q.data.settings.openHfirUrl||'');setTimezone(q.data.settings.timezone||'');setSyncError(q.data.settings.lastSyncError||'');}},[q.data]);
  const saveSettings=(e:FormEvent)=>{e.preventDefault();settings.mutate({data:{openHfirUrl:url,timezone,lastSyncError:syncError}},{onSuccess:()=>{setMessage('Integration settings saved.');qc.invalidateQueries({queryKey:getGetPortalAdminQueryKey()});qc.invalidateQueries({queryKey:getGetPortalDashboardQueryKey()});}});};
  const doTemplateImport=async()=>{if(!templateFile)return;try{const isCsv=templateFile.name.toLowerCase().endsWith('.csv');const parsed=isCsv?parseCsv(templateJson).map((row)=>({id:fieldValue(row,'id','templateId'),name:fieldValue(row,'name','templateName'),active:!['false','0','inactive','no'].includes(fieldValue(row,'active','status').toLowerCase()),source:'Imported'})):JSON.parse(templateJson);const templates=Array.isArray(parsed)?parsed:parsed.templates;await importTemplates.mutateAsync({data:{filename:templateFile.name,templates}});setMessage('Template catalog imported.');qc.invalidateQueries({queryKey:getGetPortalAdminQueryKey()});qc.invalidateQueries({queryKey:getListTemplatesQueryKey()});}catch{setMessage('Template import failed. Check the documented CSV/JSON schema; no successful sync is recorded.');}};
  if(q.isLoading)return <State mode="loading"/>; if(q.isError)return <State mode="error" retry={()=>q.refetch()}/>;
  const data=q.data;
  return <div className="page-enter"><Heading eyebrow="Portal configuration" title="Administration" description="Manage local portal users, HFIR template catalog and integration display settings. No vendor connection is configured by changing these values."/>
    {message&&<div className="mb-4 flex justify-between rounded border border-primary/20 bg-primary/5 px-4 py-3 text-xs">{message}<button onClick={()=>setMessage('')} data-testid="button-dismiss-admin-message"><X size={14}/></button></div>}
    <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-5">
        <Card><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-display font-bold">Portal users & roles</h2><p className="mt-1 text-[10px] text-muted-foreground">Changes apply to portal authorization only.</p></div><UsersRound size={17} className="text-primary"/></div>{data?.users?.length?<div className="divide-y divide-border">{data.users.map(u=><div key={u.id} data-testid={`row-admin-user-${u.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"><div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-[10px] font-bold text-primary">{u.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{u.name}</div><div className="text-[10px] text-muted-foreground">{u.email}</div></div><select value={u.role} data-testid={`select-role-${u.id}`} onChange={e=>role.mutate({userId:u.id,data:{role:e.target.value as PortalUserRole}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetPortalAdminQueryKey()});qc.invalidateQueries({queryKey:getGetPortalMeQueryKey()});}})} className="field-input sm:w-48">{roleOptions.map(r=><option key={r} value={r}>{r}</option>)}</select></div>)}</div>:<State mode="empty"/>}</Card>
        <Card><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-display font-bold">HFIR template catalog</h2><p className="mt-1 text-[10px] text-muted-foreground">Source: imported catalog · scheduling is not performed here</p></div><Boxes size={17} className="text-primary"/></div>{data?.templates?.length?<div className="divide-y divide-border">{data.templates.map(t=><div key={t.id} data-testid={`template-row-${t.id}`} className="flex items-center gap-3 px-4 py-3"><div className="grid h-8 w-8 place-items-center border border-border text-primary"><ClipboardList size={15}/></div><div className="flex-1"><div className="text-xs font-semibold">{t.name}</div><div className="font-mono text-[9px] text-muted-foreground">{t.id} · {t.source}</div></div><span className={t.active?'badge-green':'badge-neutral'}>{t.active?'Active':'Inactive'}</span></div>)}</div>:<State mode="empty"/>}
           <div className="border-t border-border p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Import template catalog (CSV or JSON)</div><a className="mb-2 inline-block text-[10px] font-semibold text-primary underline" href={`${basePath}/samples/hfir-templates.csv`} download>Download sample CSV</a><input type="file" accept=".csv,.json,text/csv,application/json" data-testid="input-template-json" className="field-input text-[10px]" onChange={async e=>{const f=e.target.files?.[0];if(f){setTemplateFile(f);setTemplateJson(await f.text());}}}/>{templateFile&&<Button variant="secondary" testId="button-import-templates" disabled={importTemplates.isPending} onClick={doTemplateImport}>{importTemplates.isPending?'Importing…':'Import catalog'}</Button>}</div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card><div className="border-b border-border p-4"><h2 className="font-display font-bold">Integration display settings</h2><p className="mt-1 text-[10px] text-muted-foreground">Modes are configuration labels. They do not initiate connectivity.</p></div>
          <div className="grid grid-cols-2 divide-x divide-border"><div className="p-4"><div className="field-caption">SAP mode</div><div className="mt-1 font-display text-xl font-bold">{data?.settings.sapMode||'Demo'}</div></div><div className="p-4"><div className="field-caption">HFIR mode</div><div className="mt-1 font-display text-xl font-bold">{data?.settings.hfirMode||'Demo'}</div></div></div>
          <form onSubmit={saveSettings} className="space-y-3 border-t border-border p-4"><label className="field-label">Open HFIR URL<input className="field-input mt-1" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" data-testid="input-hfir-url"/></label><label className="field-label">Timezone<input className="field-input mt-1" value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder="America/Chicago" data-testid="input-timezone"/></label><label className="field-label">Last sync error / operator note<textarea className="field-input mt-1 min-h-16" value={syncError} onChange={e=>setSyncError(e.target.value)} placeholder="Document a failed sync or leave empty" data-testid="input-sync-error"/></label>
            <div className="rounded bg-secondary/60 p-3 text-[10px] leading-relaxed"><div className="mb-1 flex items-center gap-2 font-bold"><span className={`h-2 w-2 rounded-full ${data?.settings.lastSyncError?'bg-[#b54d40]':'bg-[#47836d]'}`}/>{data?.settings.lastSyncError?'Last sync failed':'No sync failure recorded'}</div><div>Last sync: {fmtDate(data?.settings.lastSyncAt)}. A failed sync is never shown as successful.</div></div>
            <Button type="submit" testId="button-save-settings" disabled={settings.isPending}>{settings.isPending?'Saving…':'Save settings'}</Button>
          </form>
        </Card>
        {data?.unmatched?.length ? <Card><div className="flex items-center gap-2 border-b border-border p-4"><TriangleAlert size={15} className="text-[#b04d40]"/><h2 className="font-display font-bold">Unmatched round records</h2></div><div className="divide-y divide-border">{data.unmatched.map(r=><div className="flex justify-between p-3 text-[10px]" key={r.id}><span>{r.templateName} · {r.workOrderNo||'No SAP identifier'}</span><span className="badge-amber">Unmatched</span></div>)}</div></Card>:null}
      </div>
    </div>
  </div>;
}

function SampleWorkOrders() {
  const q = useListWorkOrders();
  const samples = (q.data ?? []).filter((wo) => wo.mappingState !== 'Unmapped' && !!wo.templateId);
  return <div className="page-enter">
    <Heading eyebrow="Reference records" title="Sample work orders" description="A separate view of demo SAP work orders already linked to HFIR inspection templates. These are labeled examples, not live SAP records."/>
    <Card>
      {q.isLoading?<State mode="loading"/>:q.isError?<State mode="error" retry={()=>q.refetch()}/>:!samples.length?<State mode="empty"/>:
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead><tr className="table-head"><th>SAP work order</th><th>Asset / plant</th><th>HFIR template</th><th>Operator</th><th>Mapping</th></tr></thead><tbody>
          {samples.map((wo)=><tr key={wo.workOrderNo} data-testid={`row-sample-work-order-${wo.workOrderNo}`} className="table-row"><td><div className="font-mono text-[11px]">{wo.workOrderNo}</div><div className="mt-1 text-[10px] text-muted-foreground">{wo.description}</div></td><td><div className="text-[11px]">{wo.asset}</div><div className="text-[9px] text-muted-foreground">{wo.plant}</div></td><td><div className="text-[10px]">{wo.templateName}</div><div className="font-mono text-[9px] text-muted-foreground">{wo.templateId}</div></td><td className="text-[10px]">{wo.operatorName||'—'}</td><td><span className={mappingClass(wo.mappingState)}>{wo.mappingState}</span></td></tr>)}
        </tbody></table></div>}
    </Card>
  </div>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/"/></Show></>;
}
function PortalPage({ children, roles }: { children: ReactNode; roles: string[] }) {
  const [location] = useLocation();
  const { isSignedIn } = useUser();
  const me = useGetPortalMe({ query: { queryKey: getGetPortalMeQueryKey(), enabled: !!isSignedIn } });
  const role = me.data?.user?.role;
  const denied = !!role && !roles.includes(role);
  const needsBootstrap = !!me.data?.bootstrapAvailable && !roles.includes('Administrator');
  if (denied || needsBootstrap) return <Protected><Shell><Card className="mx-auto max-w-lg p-8 text-center"><ShieldCheck className="mx-auto text-primary" size={25}/><h1 className="mt-4 font-display text-xl font-bold">{needsBootstrap?'Administrator setup needed':'Access restricted'}</h1><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{needsBootstrap?'Sign in to the first administrator account and claim access from the overview before continuing.':'Your current portal role does not have access to this page.'}</p><Link className="btn-primary mt-5" href="/dashboard" data-testid="button-role-gate-dashboard">Go to overview</Link></Card></Shell></Protected>;
  return <Protected><ErrorBoundary resetKey={location}><Shell>{children}</Shell></ErrorBoundary></Protected>;
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#e9e5da] px-4 py-12"><div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[38%] bg-[#20343d] lg:block"/><div className="pointer-events-none absolute left-[8%] top-[20%] hidden max-w-[330px] text-[#f5f1e8] lg:block"><div className="text-[9px] uppercase tracking-[.2em] text-white/50">Inspection coordination</div><div className="mt-4 font-display text-4xl font-extrabold leading-tight">Keep the handoff<br/><span className="text-[#e79b5f]">in sight.</span></div><p className="mt-4 text-xs leading-relaxed text-white/60">A calm, auditable desk between SAP work orders and separately scheduled HFIR rounds.</p><Link href="/" data-testid="link-auth-home" className="mt-8 inline-flex items-center gap-2 text-[10px] font-semibold text-[#e79b5f]">Back to overview <ArrowRight size={13}/></Link></div><div className="relative z-10 w-full max-w-[470px] lg:ml-[28%]">{children}</div></div>;
}
function SignInPage() { return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></AuthFrame>; }
function SignUpPage() { return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></AuthFrame>; }
function HomeRedirect() { return <><Show when="signed-in"><Redirect to="/dashboard"/></Show><Show when="signed-out"><Home/></Show></>; }

function Router() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to access the coordination desk'}},signUp:{start:{title:'Request portal access',subtitle:'Create your operations account'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <ClerkCacheReset/>
    <Switch>
      <Route path="/" component={HomeRedirect}/>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/dashboard"><PortalPage roles={['Administrator','Planner/Coordinator','Operator']}><Dashboard/></PortalPage></Route>
      <Route path="/mapping"><PortalPage roles={['Administrator','Planner/Coordinator','Operator']}><MappingPage/></PortalPage></Route>
      <Route path="/import"><PortalPage roles={['Administrator','Planner/Coordinator']}><ImportPage/></PortalPage></Route>
      <Route path="/work-orders"><PortalPage roles={['Administrator','Planner/Coordinator']}><WorkOrders/></PortalPage></Route>
      <Route path="/samples"><PortalPage roles={['Administrator','Planner/Coordinator']}><SampleWorkOrders/></PortalPage></Route>
      <Route path="/assignments"><PortalPage roles={['Operator']}><Assignments/></PortalPage></Route>
      <Route path="/rounds"><PortalPage roles={['Administrator','Planner/Coordinator','Operator']}><Rounds/></PortalPage></Route>
      <Route path="/history"><PortalPage roles={['Administrator','Planner/Coordinator','Operator']}><History/></PortalPage></Route>
      <Route path="/notifications"><PortalPage roles={['Administrator','Planner/Coordinator','Operator']}><Notifications/></PortalPage></Route>
      <Route path="/admin"><PortalPage roles={['Administrator']}><Admin/></PortalPage></Route>
      <Route component={NotFound}/>
    </Switch>
  </ClerkProvider>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
