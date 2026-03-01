import { useState, useEffect, useCallback } from "react";
import "./App.css";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrafficCone,
  Activity,
  Clock,
  AlertTriangle,
  Zap,
  LayoutGrid,
  BarChart3,
  Siren,
  Settings,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Timer,
  Car,
  TrendingUp,
  Gauge,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ---- Types ----
interface IntersectionData {
  id: string;
  name: string;
  row: number;
  col: number;
  ns_phase: string;
  ew_phase: string;
  ns_green_duration: number;
  ew_green_duration: number;
  yellow_duration: number;
  cycle_time: number;
  offset: number;
  queue_lengths: Record<string, number>;
  flow_rates: Record<string, number>;
  wait_times: Record<string, number>;
  mode: string;
  emergency_preemption: boolean;
  total_vehicles_passed: number;
  avg_wait_time: number;
  throughput_per_hour: number;
  congestion_level: number;
}

interface GridState {
  grid_rows: number;
  grid_cols: number;
  ns_streets: string[];
  ew_streets: string[];
  intersections: IntersectionData[];
  summary: {
    total_intersections: number;
    total_vehicles_passed: number;
    avg_congestion: number;
    avg_wait_seconds: number;
    total_throughput_per_hour: number;
    active_incidents: number;
    emergency_vehicles: number;
    emergency_intersections: string[];
    adaptive_mode_count: number;
  };
}

interface Incident {
  id: string;
  type: string;
  intersection_id: string;
  direction: string;
  severity: number;
  description: string;
  created_at: string;
  duration_minutes: number;
  resolved: boolean;
  resolved_at: string | null;
}

interface HistoricalEntry {
  hour: string;
  volume: number;
  avg_speed_mph: number;
  avg_wait_seconds: number;
  throughput: number;
  incidents: number;
  congestion_index: number;
}

interface Analytics {
  network_congestion: number;
  network_avg_wait: number;
  network_throughput: number;
  total_vehicles_today: number;
  busiest_intersections: { id: string; name: string; congestion: number }[];
  quietest_intersections: { id: string; name: string; congestion: number }[];
  direction_flow: Record<string, number>;
  mode_distribution: Record<string, number>;
  historical: HistoricalEntry[];
}

// ---- Helpers ----
const phaseColor = (phase: string) => {
  if (phase === "green") return "bg-emerald-500";
  if (phase === "yellow") return "bg-amber-400";
  return "bg-red-500";
};

const phaseGlow = (phase: string) => {
  if (phase === "green") return "shadow-emerald-500/50";
  if (phase === "yellow") return "shadow-amber-400/50";
  return "shadow-red-500/50";
};

const congestionColor = (level: number) => {
  if (level < 0.25) return "text-emerald-400";
  if (level < 0.5) return "text-amber-400";
  if (level < 0.75) return "text-orange-400";
  return "text-red-400";
};

const congestionBg = (level: number) => {
  if (level < 0.25) return "bg-emerald-500/20 border-emerald-500/30";
  if (level < 0.5) return "bg-amber-500/20 border-amber-500/30";
  if (level < 0.75) return "bg-orange-500/20 border-orange-500/30";
  return "bg-red-500/20 border-red-500/30";
};

const modeColor = (mode: string) => {
  if (mode === "adaptive") return "bg-blue-600";
  if (mode === "emergency") return "bg-red-600";
  if (mode === "manual") return "bg-amber-600";
  return "bg-zinc-600";
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

// ---- Signal Light Component ----
function SignalLight({ phase, size = "sm" }: { phase: string; size?: string }) {
  const dim = size === "lg" ? "h-5 w-5" : "h-3 w-3";
  return (
    <div className={`${dim} rounded-full ${phaseColor(phase)} shadow-lg ${phaseGlow(phase)}`} />
  );
}

// ---- Direction Arrow ----
function DirArrow({ dir }: { dir: string }) {
  const cls = "h-3 w-3";
  if (dir === "north") return <ArrowUp className={cls} />;
  if (dir === "south") return <ArrowDown className={cls} />;
  if (dir === "east") return <ArrowRight className={cls} />;
  return <ArrowLeft className={cls} />;
}

// ---- Intersection Card (Grid Cell) ----
function IntersectionCell({
  data,
  selected,
  onClick,
}: {
  data: IntersectionData;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`relative border rounded-lg p-2 cursor-pointer transition-all hover:scale-105 ${
        selected
          ? "border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/50"
          : `border-zinc-700/50 ${congestionBg(data.congestion_level)}`
      } ${data.emergency_preemption ? "ring-2 ring-red-500 animate-pulse" : ""}`}
      onClick={onClick}
    >
      {/* Signal indicators */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-zinc-600 text-xs leading-none">N/S</span>
            <SignalLight phase={data.ns_phase} />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-zinc-600 text-xs leading-none">E/W</span>
            <SignalLight phase={data.ew_phase} />
          </div>
        </div>
        <Badge className={`${modeColor(data.mode)} text-white text-xs px-1 py-0`}>
          {data.mode === "adaptive" ? "A" : data.mode === "emergency" ? "!" : data.mode[0].toUpperCase()}
        </Badge>
      </div>

      {/* Intersection name */}
      <p className="text-xs text-zinc-300 font-medium truncate leading-tight">{data.name}</p>

      {/* Stats row */}
      <div className="flex items-center justify-between mt-1">
        <span className={`text-xs font-mono font-bold ${congestionColor(data.congestion_level)}`}>
          {Math.round(data.congestion_level * 100)}%
        </span>
        <span className="text-xs text-zinc-500">
          {data.avg_wait_time}s
        </span>
      </div>

      {/* Queue indicators */}
      <div className="flex justify-between mt-1 text-xs text-zinc-500">
        <span>Q: {Object.values(data.queue_lengths).reduce((a, b) => a + b, 0)}</span>
        <span>{Math.round(data.throughput_per_hour)}/h</span>
      </div>
    </div>
  );
}

// ---- Intersection Detail Panel ----
function IntersectionDetail({
  data,
  onUpdateTiming,
  onEmergency,
  onClearEmergency,
}: {
  data: IntersectionData;
  onUpdateTiming: (id: string, ns: number, ew: number) => void;
  onEmergency: (id: string, dir: string) => void;
  onClearEmergency: (id: string) => void;
}) {
  const [nsGreen, setNsGreen] = useState(data.ns_green_duration);
  const [ewGreen, setEwGreen] = useState(data.ew_green_duration);

  useEffect(() => {
    setNsGreen(data.ns_green_duration);
    setEwGreen(data.ew_green_duration);
  }, [data.ns_green_duration, data.ew_green_duration]);

  return (
    <Card className="border-zinc-800 bg-zinc-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-zinc-100">{data.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={`${modeColor(data.mode)} text-white text-xs`}>{data.mode}</Badge>
            {data.emergency_preemption && (
              <Badge className="bg-red-600 text-white text-xs animate-pulse">EMERGENCY</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Signal State */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-xs text-zinc-500 mb-1">N/S Signal</p>
            <div className="flex justify-center mb-1">
              <SignalLight phase={data.ns_phase} size="lg" />
            </div>
            <p className="text-sm font-bold text-zinc-200 capitalize">{data.ns_phase}</p>
            <p className="text-xs text-zinc-500">{data.ns_green_duration}s green</p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
            <p className="text-xs text-zinc-500 mb-1">E/W Signal</p>
            <div className="flex justify-center mb-1">
              <SignalLight phase={data.ew_phase} size="lg" />
            </div>
            <p className="text-sm font-bold text-zinc-200 capitalize">{data.ew_phase}</p>
            <p className="text-xs text-zinc-500">{data.ew_green_duration}s green</p>
          </div>
        </div>

        {/* Queue & Flow */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 font-medium">Queue & Flow by Direction</p>
          <div className="grid grid-cols-4 gap-2">
            {(["north", "south", "east", "west"] as const).map((dir) => (
              <div key={dir} className="bg-zinc-800/50 rounded p-2 text-center">
                <DirArrow dir={dir} />
                <p className="text-xs text-zinc-400 capitalize mt-1">{dir}</p>
                <p className="text-sm font-bold text-zinc-200">{data.queue_lengths[dir]}</p>
                <p className="text-xs text-zinc-500">{data.flow_rates[dir]}/m</p>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className={`text-lg font-bold ${congestionColor(data.congestion_level)}`}>
              {Math.round(data.congestion_level * 100)}%
            </p>
            <p className="text-xs text-zinc-500">Congestion</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-zinc-200">{data.avg_wait_time}s</p>
            <p className="text-xs text-zinc-500">Avg Wait</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-zinc-200">{Math.round(data.throughput_per_hour)}</p>
            <p className="text-xs text-zinc-500">Vehicles/hr</p>
          </div>
        </div>

        {/* Signal Timing Controls */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 font-medium flex items-center gap-1">
            <Settings className="h-3 w-3" /> Signal Timing
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 w-20">N/S Green:</label>
              <input
                type="range"
                min={10}
                max={90}
                value={nsGreen}
                onChange={(e) => setNsGreen(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="text-xs text-zinc-300 w-8 text-right">{nsGreen}s</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 w-20">E/W Green:</label>
              <input
                type="range"
                min={10}
                max={90}
                value={ewGreen}
                onChange={(e) => setEwGreen(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="text-xs text-zinc-300 w-8 text-right">{ewGreen}s</span>
            </div>
            <button
              className="w-full px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              onClick={() => onUpdateTiming(data.id, nsGreen, ewGreen)}
            >
              Apply Timing
            </button>
          </div>
        </div>

        {/* Emergency Controls */}
        <div>
          <p className="text-xs text-zinc-500 mb-2 font-medium flex items-center gap-1">
            <Siren className="h-3 w-3" /> Emergency Preemption
          </p>
          {data.emergency_preemption ? (
            <button
              className="w-full px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              onClick={() => onClearEmergency(data.id)}
            >
              Clear Emergency
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {["north", "south", "east", "west"].map((dir) => (
                <button
                  key={dir}
                  className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 rounded transition-colors capitalize border border-red-800/50"
                  onClick={() => onEmergency(data.id, dir)}
                >
                  {dir}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Main App ----
function App() {
  const [grid, setGrid] = useState<GridState | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIntersection, setSelectedIntersection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState("grid");

  const fetchData = useCallback(async () => {
    try {
      const [gridRes, analyticsRes, incidentsRes] = await Promise.all([
        fetch(`${API}/api/grid`),
        fetch(`${API}/api/analytics`),
        fetch(`${API}/api/incidents`),
      ]);
      const gridData = await gridRes.json();
      const analyticsData = await analyticsRes.json();
      const incidentsData = await incidentsRes.json();
      setGrid(gridData);
      setAnalytics(analyticsData);
      setIncidents(incidentsData.incidents || []);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleUpdateTiming = async (id: string, nsGreen: number, ewGreen: number) => {
    await fetch(`${API}/api/intersection/${id}/timing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ns_green: nsGreen, ew_green: ewGreen }),
    });
    fetchData();
  };

  const handleEmergency = async (id: string, direction: string) => {
    await fetch(`${API}/api/intersection/${id}/emergency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    fetchData();
  };

  const handleClearEmergency = async (id: string) => {
    await fetch(`${API}/api/intersection/${id}/emergency/clear`, { method: "POST" });
    fetchData();
  };

  const handleResolveIncident = async (id: string) => {
    await fetch(`${API}/api/incidents/${id}/resolve`, { method: "POST" });
    fetchData();
  };

  const handleOptimize = async (street: string, direction: string) => {
    await fetch(`${API}/api/optimize/corridor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ street, direction }),
    });
    fetchData();
  };

  if (loading || !grid) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <TrafficCone className="h-12 w-12 text-amber-400 mx-auto animate-bounce" />
          <p className="text-zinc-400 mt-4 text-sm">Loading TrafficFlow...</p>
        </div>
      </div>
    );
  }

  const selectedData = selectedIntersection
    ? grid.intersections.find((i) => i.id === selectedIntersection)
    : null;

  const activeIncidents = incidents.filter((i) => !i.resolved);

  // Direction flow data for pie chart
  const dirFlowData = analytics
    ? Object.entries(analytics.direction_flow).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: Math.round(value),
      }))
    : [];

  // Mode distribution for pie chart
  const modeData = analytics
    ? Object.entries(analytics.mode_distribution).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-600 to-blue-600 p-2 rounded-lg">
              <TrafficCone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-100 tracking-tight">TRAFFICFLOW</h1>
              <p className="text-xs text-zinc-500 -mt-0.5">Intelligent Signal Control & Optimization</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                autoRefresh
                  ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}
            >
              <RefreshCw className={`h-3 w-3 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Live" : "Paused"}
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors border border-zinc-700"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          <Card className="border-zinc-800 bg-zinc-900/80">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Intersections</p>
                  <p className="text-2xl font-bold text-zinc-100">{grid.summary.total_intersections}</p>
                </div>
                <LayoutGrid className="h-8 w-8 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/80">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Avg Congestion</p>
                  <p className={`text-2xl font-bold ${congestionColor(grid.summary.avg_congestion)}`}>
                    {Math.round(grid.summary.avg_congestion * 100)}%
                  </p>
                </div>
                <Gauge className="h-8 w-8 text-amber-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/80">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Avg Wait</p>
                  <p className="text-2xl font-bold text-zinc-100">{grid.summary.avg_wait_seconds}s</p>
                </div>
                <Timer className="h-8 w-8 text-orange-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/80">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Throughput/hr</p>
                  <p className="text-2xl font-bold text-zinc-100">
                    {Math.round(grid.summary.total_throughput_per_hour).toLocaleString()}
                  </p>
                </div>
                <Car className="h-8 w-8 text-emerald-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/80">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Active Incidents</p>
                  <p className={`text-2xl font-bold ${activeIncidents.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {activeIncidents.length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/80">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Adaptive Mode</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {grid.summary.adaptive_mode_count}/{grid.summary.total_intersections}
                  </p>
                </div>
                <Zap className="h-8 w-8 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-4 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger
              value="grid"
              className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400 gap-1.5 text-xs"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Traffic Grid
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400 gap-1.5 text-xs"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="incidents"
              className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400 gap-1.5 text-xs"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Incidents
              {activeIncidents.length > 0 && (
                <span className="ml-1 bg-red-600 text-white text-xs rounded-full px-1.5">{activeIncidents.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="optimize"
              className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400 gap-1.5 text-xs"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Optimize
            </TabsTrigger>
          </TabsList>

          {/* ---- GRID TAB ---- */}
          <TabsContent value="grid">
            <div className="flex gap-4">
              {/* Grid Map */}
              <div className="flex-1">
                <Card className="border-zinc-800 bg-zinc-900/80">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4" />
                        Intersection Grid
                      </CardTitle>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" /> Green
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-amber-400" /> Yellow
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-red-500" /> Red
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Column headers (street names) */}
                    <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: `80px repeat(${grid.grid_cols}, 1fr)` }}>
                      <div />
                      {grid.ns_streets.map((st) => (
                        <p key={st} className="text-xs text-zinc-500 text-center truncate">{st}</p>
                      ))}
                    </div>
                    {/* Grid rows */}
                    {Array.from({ length: grid.grid_rows }).map((_, r) => (
                      <div
                        key={r}
                        className="grid gap-2 mb-2"
                        style={{ gridTemplateColumns: `80px repeat(${grid.grid_cols}, 1fr)` }}
                      >
                        <p className="text-xs text-zinc-500 flex items-center">{grid.ew_streets[r]}</p>
                        {Array.from({ length: grid.grid_cols }).map((_, c) => {
                          const intersection = grid.intersections.find(
                            (i) => i.row === r && i.col === c
                          );
                          if (!intersection) return <div key={c} />;
                          return (
                            <IntersectionCell
                              key={intersection.id}
                              data={intersection}
                              selected={selectedIntersection === intersection.id}
                              onClick={() =>
                                setSelectedIntersection(
                                  selectedIntersection === intersection.id ? null : intersection.id
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Detail Panel */}
              <div className="w-80 shrink-0">
                {selectedData ? (
                  <IntersectionDetail
                    data={selectedData}
                    onUpdateTiming={handleUpdateTiming}
                    onEmergency={handleEmergency}
                    onClearEmergency={handleClearEmergency}
                  />
                ) : (
                  <Card className="border-zinc-800 bg-zinc-900/80">
                    <CardContent className="p-8 text-center">
                      <LayoutGrid className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                      <p className="text-sm text-zinc-500">
                        Click an intersection on the grid to view details and controls
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ---- ANALYTICS TAB ---- */}
          <TabsContent value="analytics">
            {analytics && (
              <div className="space-y-4">
                {/* Traffic Volume Chart */}
                <Card className="border-zinc-800 bg-zinc-900/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      24-Hour Traffic Volume & Congestion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={analytics.historical}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="hour" stroke="#71717a" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #3f3f46",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="volume"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.15}
                          name="Volume"
                        />
                        <Area
                          type="monotone"
                          dataKey="throughput"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.1}
                          name="Throughput"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Avg Speed & Wait */}
                  <Card className="border-zinc-800 bg-zinc-900/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Avg Speed & Wait Time (24h)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={analytics.historical}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="hour" stroke="#71717a" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#18181b",
                              border: "1px solid #3f3f46",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="avg_speed_mph"
                            stroke="#10b981"
                            dot={false}
                            name="Avg Speed (mph)"
                          />
                          <Line
                            type="monotone"
                            dataKey="avg_wait_seconds"
                            stroke="#f59e0b"
                            dot={false}
                            name="Avg Wait (s)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Direction Flow & Mode Distribution */}
                  <div className="space-y-4">
                    <Card className="border-zinc-800 bg-zinc-900/80">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-zinc-400">Traffic Flow by Direction</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={dirFlowData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis type="number" stroke="#71717a" tick={{ fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" stroke="#71717a" tick={{ fontSize: 11 }} width={50} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#18181b",
                                border: "1px solid #3f3f46",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Flow (veh/min)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-zinc-800 bg-zinc-900/80">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-zinc-400">Signal Mode Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4">
                          <ResponsiveContainer width={120} height={120}>
                            <PieChart>
                              <Pie
                                data={modeData}
                                cx="50%"
                                cy="50%"
                                innerRadius={30}
                                outerRadius={50}
                                dataKey="value"
                              >
                                {modeData.map((_, index) => (
                                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="space-y-1">
                            {modeData.map((entry, index) => (
                              <div key={entry.name} className="flex items-center gap-2 text-xs">
                                <div
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                                />
                                <span className="text-zinc-400">{entry.name}:</span>
                                <span className="text-zinc-200 font-medium">{entry.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Busiest / Quietest Intersections */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="border-zinc-800 bg-zinc-900/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Most Congested
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analytics.busiest_intersections.map((item, i) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between py-1.5 px-2 bg-zinc-800/50 rounded text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-600 w-4">{i + 1}.</span>
                              <span className="text-zinc-300">{item.name}</span>
                            </div>
                            <span className={`font-mono font-bold ${congestionColor(item.congestion)}`}>
                              {Math.round(item.congestion * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-zinc-800 bg-zinc-900/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-emerald-400 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Least Congested
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analytics.quietest_intersections.map((item, i) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between py-1.5 px-2 bg-zinc-800/50 rounded text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-600 w-4">{i + 1}.</span>
                              <span className="text-zinc-300">{item.name}</span>
                            </div>
                            <span className={`font-mono font-bold ${congestionColor(item.congestion)}`}>
                              {Math.round(item.congestion * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ---- INCIDENTS TAB ---- */}
          <TabsContent value="incidents">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Traffic Incidents</h2>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                  {incidents.length} total
                </Badge>
              </div>
              {incidents.length === 0 ? (
                <Card className="border-zinc-800 bg-zinc-900/80">
                  <CardContent className="p-8 text-center">
                    <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                    <p className="text-sm text-zinc-400">No incidents reported</p>
                  </CardContent>
                </Card>
              ) : (
                incidents.map((inc) => {
                  const intersection = grid.intersections.find((i) => i.id === inc.intersection_id);
                  const severityColor =
                    inc.severity >= 0.7
                      ? "bg-red-600"
                      : inc.severity >= 0.4
                      ? "bg-amber-600"
                      : "bg-blue-600";
                  const typeIcon =
                    inc.type === "accident"
                      ? "🚗"
                      : inc.type === "construction"
                      ? "🚧"
                      : inc.type === "weather"
                      ? "🌧️"
                      : inc.type === "event"
                      ? "🎪"
                      : "⚠️";
                  return (
                    <Card
                      key={inc.id}
                      className={`border-zinc-800 bg-zinc-900/80 ${inc.resolved ? "opacity-50" : ""}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{typeIcon}</span>
                              <Badge className={`${severityColor} text-white text-xs`}>
                                {inc.type.toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  inc.resolved
                                    ? "border-emerald-500 text-emerald-400"
                                    : "border-red-500 text-red-400"
                                }`}
                              >
                                {inc.resolved ? "RESOLVED" : "ACTIVE"}
                              </Badge>
                              <span className="text-xs text-zinc-500">
                                Severity: {Math.round(inc.severity * 100)}%
                              </span>
                            </div>
                            <p className="text-sm text-zinc-200 mt-1">{inc.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                              <span>
                                📍 {intersection?.name || inc.intersection_id} ({inc.direction})
                              </span>
                              <span>⏱️ {inc.duration_minutes} min</span>
                              <span>{new Date(inc.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          {!inc.resolved && (
                            <button
                              className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors ml-4 shrink-0"
                              onClick={() => handleResolveIncident(inc.id)}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* ---- OPTIMIZE TAB ---- */}
          <TabsContent value="optimize">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Corridor Optimization</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* N/S Corridors */}
                <Card className="border-zinc-800 bg-zinc-900/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <ArrowUp className="h-4 w-4" />
                      <ArrowDown className="h-4 w-4 -ml-3" />
                      North-South Corridors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-zinc-500 mb-3">
                      Apply green wave optimization to synchronize signals along a north-south corridor.
                    </p>
                    <div className="space-y-2">
                      {grid.ns_streets.map((street) => (
                        <div
                          key={street}
                          className="flex items-center justify-between py-2 px-3 bg-zinc-800/50 rounded border border-zinc-700/50"
                        >
                          <div>
                            <p className="text-sm text-zinc-200 font-medium">{street}</p>
                            <p className="text-xs text-zinc-500">{grid.grid_rows} intersections</p>
                          </div>
                          <button
                            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            onClick={() => handleOptimize(street, "ns")}
                          >
                            Optimize
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* E/W Corridors */}
                <Card className="border-zinc-800 bg-zinc-900/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      <ArrowRight className="h-4 w-4 -ml-3" />
                      East-West Corridors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-zinc-500 mb-3">
                      Apply green wave optimization to synchronize signals along an east-west corridor.
                    </p>
                    <div className="space-y-2">
                      {grid.ew_streets.map((street) => (
                        <div
                          key={street}
                          className="flex items-center justify-between py-2 px-3 bg-zinc-800/50 rounded border border-zinc-700/50"
                        >
                          <div>
                            <p className="text-sm text-zinc-200 font-medium">{street}</p>
                            <p className="text-xs text-zinc-500">{grid.grid_cols} intersections</p>
                          </div>
                          <button
                            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            onClick={() => handleOptimize(street, "ew")}
                          >
                            Optimize
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-zinc-800 bg-zinc-900/80">
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-500">
                    <strong className="text-zinc-400">Green Wave Optimization</strong> synchronizes traffic signals
                    along a corridor so that vehicles traveling at a steady speed encounter a series of green lights.
                    The algorithm calculates optimal phase offsets based on block distance and target speed (35 mph),
                    ensuring minimum stops and maximum throughput for the selected corridor.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-8">
        <div className="max-w-screen-2xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-zinc-600">
          <span>TrafficFlow v0.1.0 | Intelligent Signal Control Platform</span>
          <span>{grid.grid_rows}×{grid.grid_cols} Grid | {grid.summary.total_intersections} Intersections | Auto-Refresh {autoRefresh ? "ON" : "OFF"}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
