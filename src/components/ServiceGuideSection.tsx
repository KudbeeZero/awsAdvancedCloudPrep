import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  X,
  XCircle,
} from 'lucide-react';
import {
  AWS_SERVICES,
  EXAM_DOMAINS,
  SHARED_RESPONSIBILITY_TASKS,
  SUPPORT_PLANS,
} from '../data/awsServices';
import { DomainId, ResponsibilityOwner, ServiceCategory } from '../data/types';
import { playFailureSound, playNeutralTap, playSuccessSound } from '../utils/audio';
import { triggerCorrectHaptic, triggerIncorrectHaptic, triggerSelectionHaptic } from '../utils/haptics';
import { ActiveStudyContext } from '../utils/coachProgress';

interface ServiceGuideSectionProps {
  initialDomainFilter?: DomainId | 'all';
  reviewedServices: string[];
  onToggleReviewed: (serviceId: string) => void;
  onStartDomainQuiz: (domain: DomainId) => void;
  onContextChange?: (ctx: ActiveStudyContext) => void;
  onAskCoach?: () => void;
}

type GuideSubTab = 'catalog' | 'shared-responsibility' | 'support-plans';

const CATEGORIES: ('All' | ServiceCategory)[] = [
  'All',
  'Compute',
  'Storage',
  'Database',
  'Networking',
  'Security & IAM',
  'Management & Governance',
  'Analytics & AI',
  'Billing & Support',
];

export function ServiceGuideSection({
  initialDomainFilter = 'all',
  reviewedServices,
  onToggleReviewed,
  onStartDomainQuiz,
  onContextChange,
  onAskCoach,
}: ServiceGuideSectionProps) {
  const [subTab, setSubTab] = useState<GuideSubTab>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<DomainId | 'all'>(initialDomainFilter);
  const [categoryFilter, setCategoryFilter] = useState<'All' | ServiceCategory>('All');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(AWS_SERVICES[0].id);
  const [mobileShowDetail, setMobileShowDetail] = useState<boolean>(false);

  // Shared Responsibility Interactive Drill state
  const [srGuesses, setSrGuesses] = useState<Record<string, ResponsibilityOwner>>({});
  const [diagramError, setDiagramError] = useState(false);

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return AWS_SERVICES.filter((svc) => {
      const matchesDomain = domainFilter === 'all' || svc.domain === domainFilter;
      const matchesCategory = categoryFilter === 'All' || svc.category === categoryFilter;
      const matchesSearch =
        !q ||
        svc.name.toLowerCase().includes(q) ||
        svc.oneLiner.toLowerCase().includes(q) ||
        svc.description.toLowerCase().includes(q) ||
        svc.examScenarios.some((s) => s.toLowerCase().includes(q));
      return matchesDomain && matchesCategory && matchesSearch;
    });
  }, [searchQuery, domainFilter, categoryFilter]);

  const activeService =
    filteredServices.find((s) => s.id === selectedServiceId) ||
    filteredServices[0] ||
    AWS_SERVICES[0];

  const activeDomainObj = EXAM_DOMAINS.find((d) => d.id === activeService.domain);
  const isReviewed = reviewedServices.includes(activeService.id);

  useEffect(() => {
    if (subTab === 'shared-responsibility') {
      onContextChange?.({
        type: 'service',
        title: 'AWS Shared Responsibility Model',
        details: 'Security OF the Cloud (AWS) vs. Security IN the Cloud (Customer).',
        domainTitle: 'Security and Compliance',
      });
      return;
    }
    if (subTab === 'support-plans') {
      onContextChange?.({
        type: 'service',
        title: 'AWS Support Plans & Response SLAs',
        details: 'Comparing Basic, Developer, Business, Enterprise On-Ramp, and Enterprise.',
        domainTitle: 'Billing, Pricing, and Support',
      });
      return;
    }
    onContextChange?.({
      type: 'service',
      title: activeService.name,
      details: `${activeService.oneLiner} Pricing: ${activeService.pricingModel}`,
      domainTitle: activeDomainObj?.title,
    });
  }, [subTab, activeService.id, activeDomainObj?.title]);

  const srCorrectCount = SHARED_RESPONSIBILITY_TASKS.filter(
    (t) => srGuesses[t.id] === t.owner
  ).length;
  const srAttemptedCount = Object.keys(srGuesses).length;

  const activeServiceIndex = filteredServices.findIndex((s) => s.id === activeService.id);
  const prevService = activeServiceIndex > 0 ? filteredServices[activeServiceIndex - 1] : null;
  const nextService =
    activeServiceIndex >= 0 && activeServiceIndex < filteredServices.length - 1
      ? filteredServices[activeServiceIndex + 1]
      : null;

  const handleSelectService = (id: string) => {
    triggerSelectionHaptic();
    setSelectedServiceId(id);
    setMobileShowDetail(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header + Sub-View Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            AWS Services, Shared Responsibility & Support
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Study high-yield service features, pricing models, and exam decision rules—plus drill the
            Shared Responsibility Model and Support Plan SLAs.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Study guide sections"
          className="w-full md:w-auto flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'catalog'}
            onClick={() => setSubTab('catalog')}
            className={`flex-1 md:flex-initial px-3 min-h-[40px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'catalog'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Services
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'shared-responsibility'}
            onClick={() => setSubTab('shared-responsibility')}
            className={`flex-1 md:flex-initial px-3 min-h-[40px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'shared-responsibility'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Shared Model
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'support-plans'}
            onClick={() => setSubTab('support-plans')}
            className={`flex-1 md:flex-initial px-3 min-h-[40px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'support-plans'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Support Plans
          </button>
        </div>
      </div>

      {/* TAB 1: SERVICES & FEATURES MASTER-DETAIL */}
      {subTab === 'catalog' && (
        <div className="space-y-5">
          {/* Filter Controls (Hidden on mobile when reading service detail so screen stays focused) */}
          <div
            className={`bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 ${
              mobileShowDetail ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search services or exam keywords (e.g., Glacier, Spot)..."
                  aria-label="Search AWS services"
                  className="w-full pl-9 pr-11 min-h-[44px] text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#C2410C] focus:bg-white"
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear service search"
                    className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="domain-filter" className="text-xs font-medium text-slate-600">
                  Domain:
                </label>
                <select
                  id="domain-filter"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value as DomainId | 'all')}
                  className="flex-1 sm:flex-initial px-3 min-h-[44px] text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-[#C2410C]"
                >
                  <option value="all">All Domains</option>
                  {EXAM_DOMAINS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.number}. {d.title} ({d.weight}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap pb-0.5">
              {CATEGORIES.map((cat) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 min-h-[40px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredServices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="font-display font-semibold text-slate-900">No matching services found</p>
              <p className="mt-1 text-sm text-slate-600">
                Try clearing your search query or switching to All Domains.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDomainFilter('all');
                  setCategoryFilter('All');
                }}
                className="mt-4 px-4 min-h-[44px] text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Service List (Visible on desktop, or on mobile when list view is active) */}
              <div
                className={`lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 lg:max-h-[680px] lg:overflow-y-auto ${
                  mobileShowDetail ? 'hidden lg:block' : 'block'
                }`}
              >
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>{filteredServices.length} Services</span>
                  <span className="font-mono tabular-nums">
                    {reviewedServices.length} reviewed
                  </span>
                </div>
                {filteredServices.map((svc) => {
                  const selected = svc.id === activeService.id;
                  const done = reviewedServices.includes(svc.id);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => handleSelectService(svc.id)}
                      className={`w-full text-left px-4 py-3.5 min-h-[58px] transition-colors cursor-pointer flex items-center justify-between gap-3 active:bg-slate-100 ${
                        selected ? 'lg:bg-amber-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p
                          className={`font-display text-sm font-bold truncate ${
                            selected ? 'lg:text-[#C2410C] text-slate-900' : 'text-slate-900'
                          }`}
                        >
                          {svc.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 truncate">
                          {svc.category} · Domain {svc.domain.replace('domain-', '')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {done && (
                          <Check
                            className="w-4 h-4 text-emerald-700"
                            aria-label="Reviewed"
                          />
                        )}
                        <ChevronRight
                          className="w-4 h-4 text-slate-400 lg:hidden"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Service Deep Dive (Visible on desktop, or on mobile when a service is tapped) */}
              <article
                className={`lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6 ${
                  mobileShowDetail ? 'block' : 'hidden lg:block'
                }`}
              >
                {/* Mobile Back Bar */}
                <div className="lg:hidden pb-3 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => setMobileShowDetail(false)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -ml-2 text-sm font-semibold text-[#C2410C] cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    All Services ({filteredServices.length})
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {activeService.category} · Domain {activeDomainObj?.number}:{' '}
                      {activeDomainObj?.title}
                    </p>
                    <h2 className="mt-1.5 font-display text-2xl font-bold text-slate-900">
                      {activeService.name}
                    </h2>
                    <p className="mt-2 text-base font-medium text-slate-700">
                      {activeService.oneLiner}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (isReviewed) {
                        playNeutralTap();
                        triggerSelectionHaptic();
                      } else {
                        playSuccessSound();
                        triggerCorrectHaptic();
                      }
                      onToggleReviewed(activeService.id);
                    }}
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isReviewed
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    {isReviewed ? 'Reviewed' : 'Mark Reviewed'}
                  </button>
                </div>

                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  {activeService.description}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900 mb-3">
                      Core Capabilities & Features
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-600 list-disc list-outside ml-4">
                      {activeService.keyFeatures.map((feat) => (
                        <li key={feat} className="leading-relaxed">
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900 mb-3">
                      Common CLF-C02 Exam Scenarios
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-600 list-disc list-outside ml-4">
                      {activeService.examScenarios.map((scen) => (
                        <li key={scen} className="leading-relaxed">
                          {scen}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-xs font-semibold text-slate-500">Pricing Model</p>
                    <p className="mt-1 text-slate-800">{activeService.pricingModel}</p>
                  </div>
                  {activeService.compareWith && (
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs font-semibold text-slate-500">Often Compared With</p>
                      <p className="mt-1 text-slate-800">{activeService.compareWith}</p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!prevService}
                      onClick={() => prevService && handleSelectService(prevService.id)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 min-h-[44px] text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={!nextService}
                      onClick={() => nextService && handleSelectService(nextService.id)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 min-h-[44px] text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {onAskCoach && (
                      <button
                        type="button"
                        onClick={onAskCoach}
                        className="px-4 min-h-[44px] text-xs font-semibold text-[#C2410C] bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Coach Tips
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onStartDomainQuiz(activeService.domain)}
                      className="px-4 min-h-[44px] text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Quiz Domain {activeDomainObj?.number}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTERACTIVE SHARED RESPONSIBILITY MATRIX */}
      {subTab === 'shared-responsibility' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="flex-1 min-h-[180px] sm:min-h-[220px] bg-slate-50">
                {!diagramError ? (
                  <img
                    src="/src/assets/images/diagram_cloud_layers_1795132763574.jpg"
                    alt="Layered cloud security boundaries and global edge architecture illustration"
                    referrerPolicy="no-referrer"
                    onError={() => setDiagramError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-700">
                    <Shield className="w-10 h-10 text-[#C2410C] mb-2" aria-hidden="true" />
                    <p className="text-sm font-semibold">Security OF vs. Security IN the Cloud</p>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-slate-200 space-y-2 text-sm text-slate-600">
                <p className="font-display font-bold text-slate-900">
                  Core Rule: Security OF vs. IN the Cloud
                </p>
                <p>
                  <strong className="text-slate-900">AWS (OF the Cloud):</strong> Physical data
                  centers, hardware, global network, hypervisor, and managed service engines.
                </p>
                <p>
                  <strong className="text-slate-900">Customer (IN the Cloud):</strong> Customer data,
                  IAM/MFA, encryption choices, firewall rules, and EC2 guest OS patches.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Interactive Responsibility Drill
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Tap AWS, Customer, or Shared for each task.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="text-slate-700 font-semibold">
                    Score: {srCorrectCount} / {SHARED_RESPONSIBILITY_TASKS.length}
                  </span>
                  {srAttemptedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSrGuesses({})}
                      className="text-[#C2410C] hover:underline cursor-pointer font-sans font-semibold min-h-[36px] px-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {SHARED_RESPONSIBILITY_TASKS.map((item) => {
                  const guess = srGuesses[item.id];
                  const isCorrect = guess === item.owner;

                  return (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.task}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.context}</p>
                        </div>

                        <div className="grid grid-cols-3 sm:flex items-center gap-2 shrink-0">
                          {(['AWS', 'Customer', 'Shared'] as ResponsibilityOwner[]).map((opt) => {
                            const picked = guess === opt;
                            let btnStyle =
                              'bg-slate-100 text-slate-700 hover:bg-slate-200 border-transparent';
                            if (picked && opt === item.owner) {
                              btnStyle = 'bg-emerald-700 text-white border-emerald-700';
                            } else if (picked && opt !== item.owner) {
                              btnStyle = 'bg-rose-700 text-white border-rose-700';
                            }

                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  if (opt === item.owner) {
                                    playSuccessSound();
                                    triggerCorrectHaptic();
                                  } else {
                                    playFailureSound();
                                    triggerIncorrectHaptic();
                                  }
                                  setSrGuesses((prev) => ({ ...prev, [item.id]: opt }));
                                }}
                                className={`px-3 min-h-[44px] text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${btnStyle}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {guess && (
                        <div
                          className={`text-xs p-3 rounded-lg flex items-start gap-2 ${
                            isCorrect
                              ? 'bg-emerald-50 text-emerald-900'
                              : 'bg-rose-50 text-rose-900'
                          }`}
                        >
                          {isCorrect ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          ) : (
                            <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          )}
                          <div>
                            <span className="font-semibold">
                              {isCorrect ? 'Correct. ' : `Incorrect — Answer: ${item.owner}. `}
                            </span>
                            {item.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPORT PLANS COMPARISON (Cards on Mobile, Table on Desktop) */}
      {subTab === 'support-plans' && (
        <div className="space-y-4">
          {/* Mobile Vertical Cards (< md) */}
          <div className="md:hidden space-y-4">
            {SUPPORT_PLANS.map((plan) => (
              <div
                key={plan.name}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-baseline justify-between gap-2 pb-3 border-b border-slate-100">
                  <h2 className="font-display text-lg font-bold text-slate-900">{plan.name}</h2>
                  <span className="font-mono text-xs font-semibold text-[#C2410C] tabular-nums">
                    {plan.monthlyCost}
                  </span>
                </div>
                <dl className="space-y-2 text-xs">
                  <div>
                    <dt className="font-semibold text-slate-500">Technical Support</dt>
                    <dd className="text-slate-800 mt-0.5">{plan.technicalSupport}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Response SLA</dt>
                    <dd className="font-mono text-slate-800 mt-0.5 tabular-nums">
                      {plan.sevResponse}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Trusted Advisor</dt>
                    <dd className="text-slate-800 mt-0.5">{plan.trustedAdvisor}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Best Exam Fit</dt>
                    <dd className="text-slate-900 font-medium mt-0.5">{plan.bestFor}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="font-display text-lg font-bold text-slate-900">
                AWS Support Plans Comparison
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Domain 4 heavily tests minimum support plans for 24/7 access, response SLAs, Trusted
                Advisor checks, and Technical Account Managers (TAMs).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3.5 px-5">Plan</th>
                    <th className="py-3.5 px-5">Monthly Pricing</th>
                    <th className="py-3.5 px-5">Technical Support Access</th>
                    <th className="py-3.5 px-5">Response Time SLA</th>
                    <th className="py-3.5 px-5">Trusted Advisor</th>
                    <th className="py-3.5 px-5">Best Exam Fit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {SUPPORT_PLANS.map((plan) => (
                    <tr key={plan.name} className="hover:bg-slate-50/70">
                      <td className="py-4 px-5 font-display font-bold text-slate-900 whitespace-nowrap">
                        {plan.name}
                      </td>
                      <td className="py-4 px-5 font-mono text-xs text-slate-800 tabular-nums">
                        {plan.monthlyCost}
                      </td>
                      <td className="py-4 px-5 text-slate-600">{plan.technicalSupport}</td>
                      <td className="py-4 px-5 font-mono text-xs text-slate-800 tabular-nums">
                        {plan.sevResponse}
                      </td>
                      <td className="py-4 px-5 text-slate-600">{plan.trustedAdvisor}</td>
                      <td className="py-4 px-5 text-slate-700 font-medium">{plan.bestFor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
