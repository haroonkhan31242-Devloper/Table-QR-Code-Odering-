import React, { useMemo, useState } from 'react';
import { Download, History } from 'lucide-react';
import type { ActivityCategory, ActivityLog } from '@/src/types/domain';
import { Card, EmptyState, Pagination } from '@/src/components/ui/Display';
import { SearchInput, Select } from '@/src/components/ui/Field';
import { Button } from '@/src/components/ui/Button';
import { ACTIVITY_CATEGORY_LABELS } from '@/src/services/audit/activityService';
import { filterRecords, paginate, searchRecords } from '@/src/services/storage/collection';
import { useDebounced } from '@/src/hooks/useData';
import { downloadText, toCsv } from '../services/analytics';
import { ActivityList } from './ActivityList';

const PAGE_SIZE = 20;

export function ActivityExplorer({ logs, fileName }: { logs: ActivityLog[]; fileName: string }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ActivityCategory>('all');
  const [actor, setActor] = useState('all');
  const [page, setPage] = useState(1);
  const q = useDebounced(query);

  const categories = useMemo(() => [...new Set(logs.map((l) => l.category))], [logs]);
  const actors = useMemo(() => [...new Map(logs.map((l) => [l.actorId, l.actorName])).entries()], [logs]);

  const filtered = useMemo(
    () =>
      filterRecords(searchRecords(logs, q, [(l) => l.action, (l) => l.details, (l) => l.actorName, (l) => l.targetLabel]), [
        category !== 'all' && ((l) => l.category === category),
        actor !== 'all' && ((l) => l.actorId === actor),
      ]),
    [logs, q, category, actor]
  );
  const pageData = paginate(filtered, page, PAGE_SIZE);

  const exportCsv = () =>
    downloadText(
      `${fileName}.csv`,
      toCsv(filtered.map((l) => ({ time: l.at, category: l.category, action: l.action, actor: l.actorName, role: l.actorRole, target: l.targetLabel ?? '', details: l.details })))
    );

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search actions, people, details…" className="lg:w-80" />
        <div className="grid flex-1 grid-cols-2 gap-3 lg:max-w-md">
          <Select
            aria-label="Category"
            value={category}
            onChange={(e) => { setCategory(e.target.value as ActivityCategory | 'all'); setPage(1); }}
            options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: ACTIVITY_CATEGORY_LABELS[c] }))]}
            className="h-10"
          />
          <Select
            aria-label="Person"
            value={actor}
            onChange={(e) => { setActor(e.target.value); setPage(1); }}
            options={[{ value: 'all', label: 'Everyone' }, ...actors.map(([id, name]) => ({ value: id, label: name }))]}
            className="h-10"
          />
        </div>
        <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length} className="lg:ml-auto">
          Export CSV
        </Button>
      </div>
      <div className="mt-3 border-t border-line pt-1">
        {pageData.items.length ? (
          <ActivityList items={pageData.items} />
        ) : (
          <EmptyState compact icon={History} title="No activity found" description="Adjust the filters, or come back after some activity." />
        )}
      </div>
      <Pagination page={pageData.page} pageCount={pageData.pageCount} total={pageData.total} onPage={setPage} label="entries" />
    </Card>
  );
}
