"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from "recharts";
import type { DailyAggregate } from "@/lib/types";
import { fmtUsd } from "@/lib/calculations";

interface Props {
  daily: DailyAggregate[];
}

/**
 * Cyan-on-black equity curve. Cumulative PnL across the active cycle, with
 * the zero line drawn so wins/losses read at a glance.
 */
export function EquityCurve({ daily }: Props) {
  if (daily.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-hud-muted">
        No trades in this cycle yet.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daily} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#0f223a" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            stroke="#5d7891"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#0e2236" }}
          />
          <YAxis
            stroke="#5d7891"
            fontSize={11}
            tickFormatter={(v) => fmtUsd(Number(v))}
            tickLine={false}
            axisLine={{ stroke: "#0e2236" }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              background: "#0a121f",
              border: "1px solid #0e2236",
              boxShadow: "0 0 12px rgba(34,211,238,0.35)",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              color: "#cfeefb"
            }}
            labelStyle={{ color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.15em" }}
            formatter={(v: number) => [fmtUsd(v), "Equity"]}
          />
          <ReferenceLine y={0} stroke="#0e2236" />
          <Area
            type="monotone"
            dataKey="cum_pnl_usd"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="url(#equityFill)"
            dot={{ r: 2, fill: "#22d3ee", stroke: "#22d3ee" }}
            activeDot={{ r: 5, fill: "#7df9ff", stroke: "#22d3ee", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
