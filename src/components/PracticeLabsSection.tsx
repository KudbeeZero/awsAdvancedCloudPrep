import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Lightbulb, Sliders, Sparkles, XCircle } from 'lucide-react';
import { EXAM_DOMAINS } from '../data/awsServices';
import { PRACTICE_SCENARIOS } from '../data/practiceScenarios';
import { playFailureSound, playSuccessSound } from '../utils/audio';
import { triggerCorrectHaptic, triggerIncorrectHaptic, triggerSelectionHaptic } from '../utils/haptics';
import { ActiveStudyContext } from '../utils/coachProgress';
import { ProAudioPlayer } from './ProAudioPlayer';

interface PracticeLabsSectionProps {
  completedScenarios: string[];
  perfectScenarios?: string[];
  onCompleteScenario: (scenarioId: string, isFirstTryPerfect?: boolean) => void;
  onContextChange?: (ctx: ActiveStudyContext) => void;
  onRequestHint?: () => void;
}

type LabTab = 'scenarios' | 'pricing-simulator';

export function PracticeLabsSection({
  completedScenarios,
  perfectScenarios = [],
  onCompleteScenario,
  onContextChange,
  onRequestHint,
}: PracticeLabsSectionProps) {
  const [activeTab, setActiveTab] = useState<LabTab>('scenarios');
  const [activeScenarioId, setActiveScenarioId] = useState<string>(PRACTICE_SCENARIOS[0].id);
  const [mobileShowLab, setMobileShowLab] = useState<boolean>(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [hadMistakeIds, setHadMistakeIds] = useState<Record<string, boolean>>({});

  // Interactive Pricing Simulator controls
  const [instanceCount, setInstanceCount] = useState<number>(8);
  const [hoursPerMonth, setHoursPerMonth] = useState<number>(730);
  const [commitment, setCommitment] = useState<'none' | '1yr' | '3yr'>('1yr');
  const [interruptible, setInterruptible] = useState<boolean>(false);
  const [strictHardwareLicense, setStrictHardwareLicense] = useState<boolean>(false);

  const activeScenario =
    PRACTICE_SCENARIOS.find((s) => s.id === activeScenarioId) || PRACTICE_SCENARIOS[0];
  const pickedOptionId = selectedOptions[activeScenario.id];
  const hasPicked = Boolean(pickedOptionId);
  const isCorrect = pickedOptionId === activeScenario.correctOptionId;

  useEffect(() => {
    if (activeTab === 'pricing-simulator') {
      onContextChange?.({
        type: 'lab',
        title: 'EC2 Pricing Model Simulator',
        details: `${instanceCount} instances at ${hoursPerMonth} hrs/mo, commitment: ${commitment}, interruptible: ${interruptible}, strict license: ${strictHardwareLicense}`,
        domainTitle: 'Billing, Pricing, and Support',
      });
      return;
    }
    const dom = EXAM_DOMAINS.find((d) => d.id === activeScenario.domain)?.title;
    onContextChange?.({
      type: 'lab',
      title: activeScenario.title,
      details: `${activeScenario.prompt} Constraints: ${activeScenario.constraints.join(', ')}${hasPicked ? `. Takeaway: ${activeScenario.architecturalTakeaway}` : ''}`,
      domainTitle: dom,
      isAnswerVisible: hasPicked,
    });
  }, [activeTab, activeScenario.id, hasPicked, instanceCount, hoursPerMonth, commitment, interruptible, strictHardwareLicense]);

  const activeLabIndex = PRACTICE_SCENARIOS.findIndex((s) => s.id === activeScenario.id);
  const prevLab = activeLabIndex > 0 ? PRACTICE_SCENARIOS[activeLabIndex - 1] : null;
  const nextLab =
    activeLabIndex >= 0 && activeLabIndex < PRACTICE_SCENARIOS.length - 1
      ? PRACTICE_SCENARIOS[activeLabIndex + 1]
      : null;

  const handleSelectLab = (id: string) => {
    triggerSelectionHaptic();
    setActiveScenarioId(id);
    setMobileShowLab(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectOption = (scenarioId: string, optionId: string, correctId: string) => {
    setSelectedOptions((prev) => ({ ...prev, [scenarioId]: optionId }));
    if (optionId === correctId) {
      playSuccessSound();
      triggerCorrectHaptic();
      const isFirstTryPerfect = !hadMistakeIds[scenarioId];
      onCompleteScenario(scenarioId, isFirstTryPerfect);
    } else {
      setHadMistakeIds((prev) => ({ ...prev, [scenarioId]: true }));
      playFailureSound();
      triggerIncorrectHaptic();
    }
  };

  const pricingBreakdown = useMemo(() => {
    const baseHourly = 0.096;
    const monthlyUnits = instanceCount * hoursPerMonth;
    const onDemand = monthlyUnits * baseHourly;
    const savingsPlanDiscount = commitment === '3yr' ? 0.66 : commitment === '1yr' ? 0.42 : 0;
    const savingsPlan =
      commitment === 'none' ? onDemand : onDemand * (1 - savingsPlanDiscount);
    const spot = onDemand * 0.15;
    const dedicatedHost = instanceCount * 730 * 0.22;

    let recommended = 'On-Demand Instances';
    let recommendationReason =
      'Zero upfront commitment suits short-term, spiky, or unpredictable workloads that cannot be interrupted.';

    if (strictHardwareLicense) {
      recommended = 'EC2 Dedicated Hosts';
      recommendationReason =
        'Per-socket or per-core BYOL software licenses (e.g., Windows Server, Oracle) require visibility into physical host sockets via Dedicated Hosts.';
    } else if (interruptible) {
      recommended = 'EC2 Spot Instances';
      recommendationReason =
        'Stateless, fault-tolerant, or checkpointed workloads can tap unused EC2 capacity for up to 90% savings over On-Demand.';
    } else if (hoursPerMonth >= 500 && commitment !== 'none') {
      recommended =
        commitment === '3yr' ? '3-Year Compute Savings Plan' : '1-Year Compute Savings Plan';
      recommendationReason =
        'Steady-state production workloads running most of the month save 40–72% via 1- or 3-year Compute Savings Plans across EC2, Fargate, and Lambda.';
    }

    const models = [
      {
        name: 'EC2 On-Demand',
        cost: onDemand,
        note: 'Pay per second · Zero commitment',
        eligible: true,
      },
      {
        name:
          commitment === '3yr'
            ? '3-Yr Savings Plan / RI'
            : commitment === '1yr'
            ? '1-Yr Savings Plan / RI'
            : 'Savings Plan (Select 1yr/3yr)',
        cost: savingsPlan,
        note:
          commitment === 'none'
            ? 'Requires 1-yr or 3-yr commitment'
            : `${Math.round(savingsPlanDiscount * 100)}% steady-state discount`,
        eligible: commitment !== 'none',
      },
      {
        name: 'EC2 Spot Instances',
        cost: spot,
        note: interruptible
          ? 'Eligible (~85% discount, 2-min notice)'
          : 'Unsuitable (workload cannot interrupt)',
        eligible: interruptible,
      },
      {
        name: 'EC2 Dedicated Hosts',
        cost: dedicatedHost,
        note: 'Single-tenant physical sockets',
        eligible: true,
      },
    ];

    const maxCost = Math.max(...models.map((m) => m.cost), 1);
    const recommendedCost = strictHardwareLicense
      ? dedicatedHost
      : interruptible
      ? spot
      : hoursPerMonth >= 500 && commitment !== 'none'
      ? savingsPlan
      : onDemand;
    const monthlySavings = Math.max(0, onDemand - recommendedCost);
    const savingsPct = onDemand > 0 ? Math.round((monthlySavings / onDemand) * 100) : 0;

    return { recommended, recommendationReason, models, maxCost, monthlySavings, savingsPct };
  }, [instanceCount, hoursPerMonth, commitment, interruptible, strictHardwareLicense]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header + Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Hands-On Architecture & Pricing Labs
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Practice choosing the right AWS architecture under real exam constraints, or simulate how
            EC2 purchasing options respond to commitment and interruption tolerance.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Practice lab views"
          className="w-full md:w-auto grid grid-cols-2 md:inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'scenarios'}
            onClick={() => setActiveTab('scenarios')}
            className={`px-3 min-h-[44px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'scenarios'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Scenarios ({completedScenarios.length}/{PRACTICE_SCENARIOS.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pricing-simulator'}
            onClick={() => setActiveTab('pricing-simulator')}
            className={`px-3 min-h-[44px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'pricing-simulator'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pricing Simulator
          </button>
        </div>
      </div>

      {/* TAB 1: ARCHITECTURE SCENARIO LABS */}
      {activeTab === 'scenarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Scenario Selector Sidebar (List on mobile, left sidebar on lg+) */}
          <div
            className={`lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 ${
              mobileShowLab ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>{PRACTICE_SCENARIOS.length} Decision Labs</span>
              <span className="font-mono tabular-nums">
                {completedScenarios.length} solved
              </span>
            </div>

            {PRACTICE_SCENARIOS.map((scen, idx) => {
              const selected = scen.id === activeScenario.id;
              const solved = completedScenarios.includes(scen.id);
              const isPerfect = perfectScenarios.includes(scen.id);
              return (
                <button
                  key={scen.id}
                  type="button"
                  onClick={() => handleSelectLab(scen.id)}
                  className={`w-full text-left px-4 py-3.5 min-h-[60px] transition-colors cursor-pointer flex items-center justify-between gap-3 active:bg-slate-100 ${
                    selected ? 'lg:bg-amber-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-500">
                      Lab 0{idx + 1} · {scen.category}{isPerfect ? ' · 1st-Try' : ''}
                    </p>
                    <p
                      className={`mt-0.5 font-display text-sm font-bold ${
                        selected ? 'lg:text-[#C2410C] text-slate-900' : 'text-slate-900'
                      }`}
                    >
                      {scen.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {solved && (
                      <CheckCircle2
                        className="w-4 h-4 text-emerald-700"
                        aria-label="Solved"
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

          {/* Active Scenario Workspace */}
          <div
            className={`lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6 ${
              mobileShowLab ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* Mobile Back Bar */}
            <div className="lg:hidden pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setMobileShowLab(false)}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -ml-2 text-sm font-semibold text-[#C2410C] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                All Labs ({PRACTICE_SCENARIOS.length})
              </button>
            </div>

            <div className="pb-5 border-b border-slate-100">
              <p className="text-xs font-medium text-slate-500">
                {activeScenario.category} ·{' '}
                {EXAM_DOMAINS.find((d) => d.id === activeScenario.domain)?.title}
              </p>
              <h2 className="mt-1.5 font-display text-xl sm:text-2xl font-bold text-slate-900">
                {activeScenario.title}
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-700 leading-relaxed">
                {activeScenario.prompt}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Constraints: </span>
                {activeScenario.constraints.join(' · ')}
              </p>
              <div className="mt-4">
                <ProAudioPlayer
                  compact
                  lessonType="lab"
                  lessonId={activeScenario.id}
                  title={activeScenario.title}
                  summary={activeScenario.prompt}
                  facts={activeScenario.constraints}
                  examTip={hasPicked ? activeScenario.architecturalTakeaway : undefined}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600">
                  Select the best AWS architecture decision:
                </p>
                {onRequestHint && (
                  <button
                    type="button"
                    onClick={onRequestHint}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-[#C2410C] bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                    Coach Hint
                  </button>
                )}
              </div>
              {activeScenario.options.map((opt) => {
                const isSelected = pickedOptionId === opt.id;
                const isRightOption = opt.id === activeScenario.correctOptionId;

                let cardStyle = 'border-slate-200 bg-white hover:border-slate-300';
                if (hasPicked) {
                  if (isRightOption) {
                    cardStyle = 'border-emerald-300 bg-emerald-50/70';
                  } else if (isSelected && !isRightOption) {
                    cardStyle = 'border-rose-300 bg-rose-50/70';
                  }
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      handleSelectOption(
                        activeScenario.id,
                        opt.id,
                        activeScenario.correctOptionId
                      )
                    }
                    className={`w-full text-left p-4 min-h-[52px] rounded-xl border transition-colors active:scale-[0.99] cursor-pointer space-y-2 ${cardStyle}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-display text-sm font-bold text-slate-900">
                        {opt.label}
                      </span>
                      {hasPicked && isRightOption && (
                        <CheckCircle2
                          className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                      )}
                      {hasPicked && isSelected && !isRightOption && (
                        <XCircle
                          className="w-4 h-4 text-rose-700 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    {hasPicked && (isSelected || isRightOption) && (
                      <p className="text-xs text-slate-700 leading-relaxed">{opt.rationale}</p>
                    )}
                  </button>
                );
              })}
            </div>

            {hasPicked && (
              <div
                className={`p-4 rounded-xl border text-sm ${
                  isCorrect
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                <p className="font-display font-bold text-xs inline-flex items-center gap-1.5">
                  {isCorrect && perfectScenarios.includes(activeScenario.id) && (
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                  )}
                  {isCorrect
                    ? perfectScenarios.includes(activeScenario.id)
                      ? 'First-Try Perfect · Exam Rule Verified'
                      : 'Exam Rule Verified'
                    : 'Key Architectural Takeaway'}
                </p>
                <p className="mt-1 leading-relaxed">{activeScenario.architecturalTakeaway}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={!prevLab}
                onClick={() => prevLab && handleSelectLab(prevLab.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Prev Lab
              </button>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Lab {activeLabIndex + 1} / {PRACTICE_SCENARIOS.length}
              </span>
              <button
                type="button"
                disabled={!nextLab}
                onClick={() => nextLab && handleSelectLab(nextLab.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                Next Lab
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE EC2 PRICING MODEL SIMULATOR */}
      {activeTab === 'pricing-simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Parameter Controls */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Sliders className="w-4 h-4 text-[#C2410C]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Workload Parameters
              </h2>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="sim-instances" className="font-semibold text-slate-700">
                  Compute Fleet Size
                </label>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {instanceCount} instances
                </span>
              </div>
              <div className="py-1">
                <input
                  id="sim-instances"
                  type="range"
                  min={1}
                  max={40}
                  value={instanceCount}
                  onChange={(e) => setInstanceCount(Number(e.target.value))}
                  className="w-full h-8 accent-[#C2410C] cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="sim-hours" className="font-semibold text-slate-700">
                  Monthly Runtime per Instance
                </label>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {hoursPerMonth} hrs / mo
                </span>
              </div>
              <div className="py-1">
                <input
                  id="sim-hours"
                  type="range"
                  min={40}
                  max={730}
                  step={10}
                  value={hoursPerMonth}
                  onChange={(e) => setHoursPerMonth(Number(e.target.value))}
                  className="w-full h-8 accent-[#C2410C] cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700">
                Term Commitment Willingness
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'none', label: 'No Term' },
                    { id: '1yr', label: '1-Year' },
                    { id: '3yr', label: '3-Year' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerSelectionHaptic();
                      setCommitment(item.id);
                    }}
                    className={`min-h-[44px] px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      commitment === item.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="flex items-start gap-3 min-h-[44px] py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={interruptible}
                  onChange={(e) => {
                    triggerSelectionHaptic();
                    setInterruptible(e.target.checked);
                  }}
                  className="mt-0.5 accent-[#C2410C] w-5 h-5 shrink-0 cursor-pointer"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong className="block text-slate-900">
                    Stateless & Fault-Tolerant Workload
                  </strong>
                  Can withstand a 2-minute EC2 termination notice (e.g., batch jobs, CI runners).
                </span>
              </label>

              <label className="flex items-start gap-3 min-h-[44px] py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={strictHardwareLicense}
                  onChange={(e) => {
                    triggerSelectionHaptic();
                    setStrictHardwareLicense(e.target.checked);
                  }}
                  className="mt-0.5 accent-[#C2410C] w-5 h-5 shrink-0 cursor-pointer"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong className="block text-slate-900">
                    Strict Per-Socket / Per-Core BYOL Licensing
                  </strong>
                  Requires dedicated single-tenant physical server visibility.
                </span>
              </label>
            </div>
          </div>

          {/* Right Live Cost Chart & Exam Recommendation */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6">
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#C2410C]">
                  Recommended CLF-C02 Purchase Option
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {pricingBreakdown.recommended}
                </h3>
                <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">
                  {pricingBreakdown.recommendationReason}
                </p>
              </div>
              {pricingBreakdown.monthlySavings > 0 && (
                <div className="shrink-0 bg-white border border-amber-200 rounded-lg px-4 py-3 text-left sm:text-right font-mono tabular-nums">
                  <p className="text-[11px] text-slate-500">Est. Savings vs On-Demand</p>
                  <p className="text-lg font-bold text-emerald-700">
                    -${pricingBreakdown.monthlySavings.toFixed(0)}/mo ({pricingBreakdown.savingsPct}%)
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Estimated Monthly Compute Comparison</span>
                <span className="font-mono tabular-nums">USD / month</span>
              </div>

              {pricingBreakdown.models.map((model) => {
                const widthPct = Math.max((model.cost / pricingBreakdown.maxCost) * 100, 4);
                return (
                  <div key={model.name} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 block sm:inline">
                          {model.name}
                        </span>
                        <span className="sm:ml-2 text-xs text-slate-500 block sm:inline">
                          {model.note}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                        ${model.cost.toFixed(0)}/mo
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 rounded-full ${
                          model.eligible ? 'bg-[#C2410C]' : 'bg-slate-300'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
