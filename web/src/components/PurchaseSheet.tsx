import { useEffect, useState } from 'react';
import type { Category, Purchase, Split } from '../../../shared/types';
import { money, round2, timeAgo } from '../format';
import { useStore } from '../store';
import { jarStyle } from '../theme';
import { Banner, Chip, Icon, JarIcon, PrimaryButton, SecondaryButton, Tag } from './ui';

export function PurchaseSheet() {
  const { state, selectedPurchaseId, closePurchase } = useStore();
  const purchase = state?.purchases.find((p) => p.id === selectedPurchaseId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePurchase();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePurchase]);

  if (!state?.plan || !purchase) return null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 animate-fade-in bg-on-surface/30" onClick={closePurchase} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={purchase.merchant}
        className="no-scrollbar relative max-h-[90%] animate-slide-up overflow-y-auto rounded-t-[2rem] bg-surface px-5 pb-6 pt-3 shadow-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-outline-variant" />
        <PurchaseDetails key={purchase.id} purchase={purchase} categories={state.plan.categories} editable={state.phase === 'active'} />
      </div>
    </div>
  );
}

function PurchaseDetails({ purchase, categories, editable }: { purchase: Purchase; categories: Category[]; editable: boolean }) {
  const { actions, busy, closePurchase } = useStore();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const home = byId.get(purchase.suggestedCategoryId);
  const targets = categories.filter((c) => c.type === 'flexible' && c.id !== purchase.suggestedCategoryId);
  const canSplit = editable && home?.type === 'flexible' && targets.length > 0;

  const existingTarget = purchase.splits.find((s) => s.categoryId !== purchase.suggestedCategoryId)?.categoryId;
  const [targetId, setTargetId] = useState(existingTarget ?? (targets.find((c) => c.id === 'free') ?? targets[0])?.id);
  const movedTo = (id?: string) => round2(purchase.splits.filter((s) => s.categoryId === id).reduce((sum, s) => sum + s.amount, 0));
  const [moveAmount, setMoveAmount] = useState(() => movedTo(targetId));
  const target = targetId ? byId.get(targetId) : undefined;
  const style = jarStyle(purchase.splits[0]?.categoryId ?? purchase.suggestedCategoryId);

  const apply = (requested: number) => {
    if (!home || !target) return;
    const move = round2(Math.min(Math.max(requested, 0), purchase.amount));
    const keep = round2(purchase.amount - move);
    const splits: Split[] = [
      ...(keep > 0 ? [{ categoryId: home.id, amount: keep }] : []),
      ...(move > 0 ? [{ categoryId: target.id, amount: move }] : []),
    ];
    setMoveAmount(move);
    const message =
      move === 0 ? `Back in ${home.name}` : keep === 0 ? `Moved to ${target.name}` : `${money(move)} moved to ${target.name}`;
    void actions.split(purchase.id, splits, message);
  };

  const quickMoves = [
    ...[5, 10].filter((value) => value < purchase.amount).map((value) => ({ label: money(value, purchase.currency, 0), value })),
    { label: 'Half', value: round2(purchase.amount / 2) },
    { label: 'All', value: purchase.amount },
  ];
  const coveredTotal = round2(purchase.coverage.reduce((sum, c) => sum + c.amount, 0));
  const overspentJars = [...new Set(purchase.coverage.map((c) => nameOf(c.toCategoryId)))].join(' and ');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: style.bg, color: style.fg }}>
          <Icon name={purchase.icon} className="text-[24px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-title-sm text-title-sm">{purchase.merchant}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Wise card payment · {timeAgo(purchase.createdAt)}</div>
        </div>
        <div className="text-right">
          <div className="tabular font-headline-md text-headline-md">-{money(purchase.amount, purchase.currency)}</div>
          {purchase.original && (
            <div className="font-body-sm text-body-sm text-outline">
              {money(purchase.original.amount, purchase.original.currency)} at {purchase.original.rate.toFixed(4)}
            </div>
          )}
        </div>
      </div>

      {home && (
        <div className="flex items-center gap-3 rounded bg-surface-container-lowest p-4 shadow-sm">
          <JarIcon category={home} />
          <div className="min-w-0 flex-1">
            <div className="font-currency-tag text-currency-tag uppercase text-on-surface-variant">Suggested jar</div>
            <div className="font-label-bold text-label-bold">{home.name}</div>
            <div className="font-body-sm text-body-sm text-on-surface-variant">{purchase.suggestion.reason}</div>
          </div>
          <Tag tone="lime">{Math.round(purchase.suggestion.confidence * 100)}% match</Tag>
        </div>
      )}

      {purchase.coverage.length > 0 && (
        <Banner tone="success" icon="shield" title={`${overspentJars} went ${money(coveredTotal)} over, covered`}>
          {purchase.coverage.map((c) => `${money(c.amount)} from ${nameOf(c.fromCategoryId)}`).join(', ')}. 🔒 Rent, utilities
          and 🛡 cushion were not touched.
        </Banner>
      )}
      {purchase.uncovered > 0 && (
        <Banner tone="danger" icon="warning" title={`${money(purchase.uncovered)} over budget`}>
          Every flexible jar is empty. Rent, utilities and your cushion stay protected: nothing is taken from them.
        </Banner>
      )}

      {canSplit && target && (
        <div className="flex flex-col gap-3 rounded bg-surface-container-lowest p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-label-bold text-label-bold">Move part of it</span>
            <span className="font-body-sm text-body-sm text-outline">Only between flexible jars</span>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {targets.map((c) => (
              <Chip
                key={c.id}
                icon={c.icon}
                selected={c.id === targetId}
                onClick={() => {
                  setTargetId(c.id);
                  setMoveAmount(movedTo(c.id));
                }}
              >
                {c.name}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {quickMoves.map((quick) => (
              <button
                key={quick.label}
                type="button"
                disabled={busy}
                onClick={() => apply(quick.value)}
                className="h-10 rounded-full bg-primary-container font-label-bold text-label-bold text-on-primary-fixed transition active:scale-95 disabled:opacity-50"
              >
                {quick.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <input
              type="range"
              min={0}
              max={purchase.amount}
              step={0.01}
              value={moveAmount}
              aria-label={`Amount to move to ${target.name}`}
              onChange={(event) => setMoveAmount(Number(event.target.value))}
              className="w-full"
            />
            <div className="tabular flex justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>
                {home?.name} {money(round2(purchase.amount - moveAmount), purchase.currency)}
              </span>
              <span>
                {target.name} {money(moveAmount, purchase.currency)}
              </span>
            </div>
          </div>
          <SecondaryButton size="md" disabled={busy || moveAmount === movedTo(targetId)} onClick={() => apply(moveAmount)}>
            Apply split
          </SecondaryButton>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded bg-surface-container-low p-4">
        <span className="font-currency-tag text-currency-tag uppercase text-on-surface-variant">Charged to</span>
        {purchase.splits.map((split) => {
          const jar = byId.get(split.categoryId);
          return (
            <div key={split.categoryId} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {jar && <JarIcon category={jar} size="sm" />}
                <span className="font-label-bold text-label-bold">{nameOf(split.categoryId)}</span>
              </span>
              <span className="tabular font-label-bold text-label-bold">{money(split.amount, purchase.currency)}</span>
            </div>
          );
        })}
      </div>

      <PrimaryButton onClick={closePurchase}>Done</PrimaryButton>
    </div>
  );
}
