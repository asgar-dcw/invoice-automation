import { useEffect, useState } from 'react';
import { Users, FileCheck, TrendingUp } from 'lucide-react';
import type { ClientRow } from '../../types/invoice';

interface StatsCardsProps {
  clients: ClientRow[];
  loading: boolean;
}

function AnimatedNumber({ value, suffix = '' }: {
  value: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 1200;
    const steps = 40;
    const stepTime = duration / steps;
    let current = 0;
    const increment = value / steps;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(current);
      }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="tabular-nums">
      {Math.round(display).toLocaleString('en-US')}
      {suffix}
    </span>
  );
}

export default function StatsCards({ clients, loading }: StatsCardsProps) {
  const totalClients = clients.length;
  const selectedClients = clients.filter((c) => c.selected).length;
  const readyToRun = clients.filter((c) => c.manual_attachment !== 'yes').length;

  const cards = [
    {
      label: 'Total Clients',
      value: totalClients,
      icon: Users,
      color: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-100',
    },
    {
      label: 'Selected Clients',
      value: selectedClients,
      icon: FileCheck,
      color: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-700',
      borderColor: 'border-orange-100',
      suffix: ` / ${totalClients}`,
    },
    {
      label: 'Ready to Run',
      value: readyToRun,
      icon: TrendingUp,
      color: 'from-emerald-500 to-green-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-100',
      suffix: ` / ${totalClients}`,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="skeleton w-10 h-10 rounded-xl" />
              <div className="skeleton w-20 h-4" />
            </div>
            <div className="skeleton w-28 h-8" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`group relative bg-white rounded-2xl border ${card.borderColor} p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden`}
        >
          <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${card.color} opacity-[0.04] rounded-full -translate-y-8 translate-x-8 group-hover:opacity-[0.08] transition-opacity`} />
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.color} shadow-lg`}>
              <card.icon className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {card.label}
            </span>
          </div>
          <p className={`text-2xl font-bold ${card.textColor}`}>
            <AnimatedNumber
              value={card.value}
              suffix={card.suffix}
            />
          </p>
        </div>
      ))}
    </div>
  );
}
