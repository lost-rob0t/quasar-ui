import { useEffect, useMemo, useState } from "react";
import { Database, FileText, GitBranch, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import { buildGraph, graphStatistics } from "../lib/graph";
import { useQuasar } from "../store";

function StatCard({ label, value, Icon }) {
  return <div className="stat-card"><Icon size={20} /><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}

function Distribution({ title, values }) {
  const entries = Object.entries(values).sort((left, right) => right[1] - left[1]);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return (
    <section className="panel distribution">
      <h2>{title}</h2>
      <div className="distribution-list">
        {entries.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <div className="bar"><i style={{ width: `${(value / max) * 100}%` }} /></div>
            <strong>{value}</strong>
          </div>
        ))}
        {!entries.length && <p className="muted">No values.</p>}
      </div>
    </section>
  );
}

export default function StatsPage() {
  const { documents, workspace, databaseInfo } = useQuasar();
  const [info, setInfo] = useState(null);
  const graph = useMemo(() => buildGraph(documents, workspace?.positions || {}), [documents, workspace?.positions]);
  const stats = useMemo(() => graphStatistics(documents, graph), [documents, graph]);

  useEffect(() => { databaseInfo().then(setInfo).catch(() => {}); }, [databaseInfo, documents.length]);

  return (
    <section>
      <div className="page-heading"><div><span className="eyebrow">Corpus telemetry</span><h1>Statistics</h1><p>Live local counts calculated from PouchDB and the current graph projection.</p></div></div>

      <div className="stats-grid">
        <StatCard label="Documents" value={stats.documents} Icon={FileText} />
        <StatCard label="Graph nodes" value={stats.nodes} Icon={GitBranch} />
        <StatCard label="Graph edges" value={stats.edges} Icon={Link2} />
        <StatCard label="Relations" value={stats.relations} Icon={NetworkIcon} />
        <StatCard label="Sources" value={stats.sources} Icon={ShieldCheck} />
        <StatCard label="Evidence" value={stats.evidence} Icon={Database} />
        <StatCard label="Unresolved nodes" value={stats.unresolvedNodes} Icon={TriangleAlert} />
        <StatCard label="Local update sequence" value={Number(info?.documents?.update_seq || 0)} Icon={Database} />
      </div>

      <div className="dashboard-grid">
        <Distribution title="Documents by dtype" values={stats.byDtype} />
        <Distribution title="Documents by dataset" values={stats.byDataset} />
        <Distribution title="Documents by status" values={stats.byStatus} />
        <section className="panel distribution">
          <h2>Most connected nodes</h2>
          <div className="ranking-list">
            {stats.topConnected.map((item, index) => <div key={item.id}><span>{index + 1}</span><div><strong>{item.label}</strong><code>{item.id}</code></div><b>{item.count}</b></div>)}
            {!stats.topConnected.length && <p className="muted">No connected nodes.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

function NetworkIcon(props) {
  return <GitBranch {...props} />;
}
