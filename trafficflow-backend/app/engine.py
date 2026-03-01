"""
TrafficFlow Engine - Intelligent Traffic Simulation & Signal Control

Core simulation engine that models intersections, traffic flow,
signal timing, and adaptive optimization.
"""

import random
import math
import threading
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional


class SignalPhase(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class Direction(str, Enum):
    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"


class VehicleType(str, Enum):
    CAR = "car"
    TRUCK = "truck"
    BUS = "bus"
    EMERGENCY = "emergency"
    PEDESTRIAN = "pedestrian"


class IncidentType(str, Enum):
    ACCIDENT = "accident"
    CONSTRUCTION = "construction"
    WEATHER = "weather"
    EVENT = "event"
    BREAKDOWN = "breakdown"


class Intersection:
    def __init__(
        self,
        intersection_id: str,
        name: str,
        row: int,
        col: int,
        ns_green_duration: int = 30,
        ew_green_duration: int = 30,
        yellow_duration: int = 5,
    ):
        self.id = intersection_id
        self.name = name
        self.row = row
        self.col = col

        # Signal configuration
        self.ns_green_duration = ns_green_duration
        self.ew_green_duration = ew_green_duration
        self.yellow_duration = yellow_duration
        self.cycle_time = ns_green_duration + ew_green_duration + 2 * yellow_duration
        self.offset = 0  # Phase offset for green wave coordination

        # Current state
        self.ns_phase = SignalPhase.GREEN
        self.ew_phase = SignalPhase.RED
        self.phase_timer = 0.0
        self.cycle_position = 0.0

        # Traffic counts per direction (vehicles per 5-min interval)
        self.queue_lengths: dict[str, int] = {
            "north": 0, "south": 0, "east": 0, "west": 0
        }
        self.flow_rates: dict[str, float] = {
            "north": 0.0, "south": 0.0, "east": 0.0, "west": 0.0
        }
        self.wait_times: dict[str, float] = {
            "north": 0.0, "south": 0.0, "east": 0.0, "west": 0.0
        }

        # Adaptive control
        self.mode = "adaptive"  # "fixed", "adaptive", "emergency", "manual"
        self.adaptive_enabled = True
        self.emergency_preemption = False
        self.emergency_direction: Optional[str] = None

        # Statistics
        self.total_vehicles_passed = 0
        self.total_wait_time = 0.0
        self.avg_wait_time = 0.0
        self.throughput_per_hour = 0.0
        self.congestion_level = 0.0  # 0.0 = free flow, 1.0 = gridlock

    def get_current_phases(self) -> dict:
        return {
            "north": self.ns_phase,
            "south": self.ns_phase,
            "east": self.ew_phase,
            "west": self.ew_phase,
        }

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "row": self.row,
            "col": self.col,
            "phases": self.get_current_phases(),
            "ns_phase": self.ns_phase,
            "ew_phase": self.ew_phase,
            "ns_green_duration": self.ns_green_duration,
            "ew_green_duration": self.ew_green_duration,
            "yellow_duration": self.yellow_duration,
            "cycle_time": self.cycle_time,
            "offset": self.offset,
            "queue_lengths": self.queue_lengths,
            "flow_rates": self.flow_rates,
            "wait_times": self.wait_times,
            "mode": self.mode,
            "emergency_preemption": self.emergency_preemption,
            "total_vehicles_passed": self.total_vehicles_passed,
            "avg_wait_time": round(self.avg_wait_time, 1),
            "throughput_per_hour": round(self.throughput_per_hour, 0),
            "congestion_level": round(self.congestion_level, 2),
        }


class TrafficIncident:
    def __init__(
        self,
        incident_type: IncidentType,
        intersection_id: str,
        direction: str,
        severity: float,
        description: str,
        duration_minutes: int = 30,
    ):
        self.id = str(uuid.uuid4())[:8]
        self.type = incident_type
        self.intersection_id = intersection_id
        self.direction = direction
        self.severity = severity  # 0.0 - 1.0
        self.description = description
        self.created_at = datetime.utcnow().isoformat()
        self.duration_minutes = duration_minutes
        self.resolved = False
        self.resolved_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "intersection_id": self.intersection_id,
            "direction": self.direction,
            "severity": self.severity,
            "description": self.description,
            "created_at": self.created_at,
            "duration_minutes": self.duration_minutes,
            "resolved": self.resolved,
            "resolved_at": self.resolved_at,
        }


class TrafficEngine:
    """Core traffic simulation and signal control engine."""

    def __init__(self, grid_rows: int = 4, grid_cols: int = 5):
        self._lock = threading.Lock()
        self.grid_rows = grid_rows
        self.grid_cols = grid_cols
        self.sim_time = 0.0  # Simulation seconds elapsed
        self.sim_speed = 1.0  # Multiplier
        self.running = True

        # Street names for the grid
        self.ns_streets = ["1st Ave", "2nd Ave", "3rd Ave", "Main St", "Park Ave"]
        self.ew_streets = ["Oak St", "Elm St", "Pine St", "Maple St"]

        # Traffic patterns (hourly multipliers, 0-23) - must be set before _init_grid
        self.hourly_patterns = self._generate_hourly_patterns()

        # Incidents - must be initialized before _init_grid (which calls _update_traffic_conditions)
        self.incidents: list[TrafficIncident] = []

        # Create intersection grid
        self.intersections: dict[str, Intersection] = {}
        self._init_grid()

        # Seed demo incidents after grid is ready
        self._seed_incidents()

        # Historical data (last 24 hours, per-hour)
        self.hourly_stats: list[dict] = self._generate_historical_data()

        # Global stats
        self.total_intersections = len(self.intersections)
        self.emergency_vehicles_active = 0

        # Run initial simulation tick to populate data
        for _ in range(10):
            self._simulation_tick()

    def _init_grid(self):
        for r in range(self.grid_rows):
            for c in range(self.grid_cols):
                iid = f"int-{r}-{c}"
                name = f"{self.ns_streets[c]} & {self.ew_streets[r]}"

                # Vary green durations based on road importance
                ns_green = 30
                ew_green = 30
                if c == 3:  # Main St gets more NS green
                    ns_green = 40
                    ew_green = 25
                if r == 1:  # Elm St is a major corridor
                    ew_green = 40
                    ns_green = 25

                intersection = Intersection(
                    intersection_id=iid,
                    name=name,
                    row=r,
                    col=c,
                    ns_green_duration=ns_green,
                    ew_green_duration=ew_green,
                )

                # Set phase offsets for green wave on Main St (col 3)
                if c == 3:
                    intersection.offset = r * 8  # 8s offset per block

                self.intersections[iid] = intersection

        # Simulate initial traffic conditions
        self._update_traffic_conditions()

    def _generate_hourly_patterns(self) -> list[float]:
        """Generate realistic hourly traffic volume multipliers."""
        return [
            0.15, 0.10, 0.08, 0.06, 0.08, 0.15,  # 0-5 AM
            0.35, 0.65, 0.90, 0.75, 0.60, 0.65,  # 6-11 AM
            0.70, 0.65, 0.60, 0.65, 0.80, 0.95,  # 12-5 PM
            0.85, 0.65, 0.50, 0.40, 0.30, 0.20,  # 6-11 PM
        ]

    def _update_traffic_conditions(self):
        """Update traffic volumes based on time of day and random variation."""
        current_hour = datetime.utcnow().hour
        base_multiplier = self.hourly_patterns[current_hour]

        for iid, intersection in self.intersections.items():
            for direction in ["north", "south", "east", "west"]:
                # Base flow rate (vehicles per minute)
                base_rate = random.uniform(5, 20) * base_multiplier

                # Main St and Elm St get more traffic
                if intersection.col == 3:
                    base_rate *= 1.4
                if intersection.row == 1:
                    base_rate *= 1.3

                # Apply incident effects
                for incident in self.incidents:
                    if incident.intersection_id == iid and not incident.resolved:
                        if incident.direction == direction:
                            base_rate *= (1 - incident.severity * 0.7)
                        else:
                            base_rate *= (1 - incident.severity * 0.2)

                intersection.flow_rates[direction] = round(base_rate, 1)

                # Queue length based on whether direction has red light
                phases = intersection.get_current_phases()
                if phases[direction] == SignalPhase.RED:
                    intersection.queue_lengths[direction] = random.randint(
                        int(base_rate * 0.3), int(base_rate * 0.8)
                    )
                elif phases[direction] == SignalPhase.YELLOW:
                    intersection.queue_lengths[direction] = random.randint(0, int(base_rate * 0.3))
                else:
                    intersection.queue_lengths[direction] = random.randint(0, max(1, int(base_rate * 0.1)))

                # Wait times
                if phases[direction] == SignalPhase.RED:
                    intersection.wait_times[direction] = round(random.uniform(10, 45), 1)
                else:
                    intersection.wait_times[direction] = round(random.uniform(0, 5), 1)

            # Compute aggregate stats
            total_queue = sum(intersection.queue_lengths.values())
            total_flow = sum(intersection.flow_rates.values())
            avg_wait = sum(intersection.wait_times.values()) / 4

            intersection.congestion_level = min(1.0, total_queue / max(1, total_flow * 2))
            intersection.avg_wait_time = avg_wait
            intersection.throughput_per_hour = total_flow * 60
            intersection.total_vehicles_passed += random.randint(5, 30)

    def _simulation_tick(self):
        """Advance simulation by one tick."""
        with self._lock:
            self.sim_time += 5.0 * self.sim_speed

            for intersection in self.intersections.values():
                # Advance phase
                cycle = intersection.cycle_time
                pos = (self.sim_time + intersection.offset) % cycle

                ns_green_end = intersection.ns_green_duration
                ns_yellow_end = ns_green_end + intersection.yellow_duration
                ew_green_end = ns_yellow_end + intersection.ew_green_duration
                # ew_yellow_end = cycle

                if pos < ns_green_end:
                    intersection.ns_phase = SignalPhase.GREEN
                    intersection.ew_phase = SignalPhase.RED
                elif pos < ns_yellow_end:
                    intersection.ns_phase = SignalPhase.YELLOW
                    intersection.ew_phase = SignalPhase.RED
                elif pos < ew_green_end:
                    intersection.ns_phase = SignalPhase.RED
                    intersection.ew_phase = SignalPhase.GREEN
                else:
                    intersection.ns_phase = SignalPhase.RED
                    intersection.ew_phase = SignalPhase.YELLOW

                # Emergency preemption
                if intersection.emergency_preemption:
                    if intersection.emergency_direction in ["north", "south"]:
                        intersection.ns_phase = SignalPhase.GREEN
                        intersection.ew_phase = SignalPhase.RED
                    else:
                        intersection.ns_phase = SignalPhase.RED
                        intersection.ew_phase = SignalPhase.GREEN

            self._update_traffic_conditions()

    def _seed_incidents(self):
        """Create some initial incidents for demo."""
        self.incidents = [
            TrafficIncident(
                incident_type=IncidentType.ACCIDENT,
                intersection_id="int-1-2",
                direction="east",
                severity=0.7,
                description="Multi-vehicle collision on Elm St & 3rd Ave. Two lanes blocked. Emergency response on scene.",
                duration_minutes=45,
            ),
            TrafficIncident(
                incident_type=IncidentType.CONSTRUCTION,
                intersection_id="int-2-3",
                direction="north",
                severity=0.4,
                description="Road resurfacing on Main St between Pine St and Maple St. Right lane closed.",
                duration_minutes=480,
            ),
            TrafficIncident(
                incident_type=IncidentType.EVENT,
                intersection_id="int-0-4",
                direction="south",
                severity=0.3,
                description="Concert at City Arena ending at 10 PM. Expect heavy pedestrian and vehicle traffic near Park Ave & Oak St.",
                duration_minutes=120,
            ),
        ]

    def _generate_historical_data(self) -> list[dict]:
        """Generate 24 hours of historical traffic data."""
        stats = []
        now = datetime.utcnow()
        for h in range(24):
            hour_time = now - timedelta(hours=23 - h)
            multiplier = self.hourly_patterns[hour_time.hour]
            base_volume = int(multiplier * 2500 + random.randint(-200, 200))
            stats.append({
                "hour": hour_time.strftime("%H:00"),
                "hour_num": hour_time.hour,
                "volume": max(0, base_volume),
                "avg_speed_mph": round(25 + (1 - multiplier) * 20 + random.uniform(-3, 3), 1),
                "avg_wait_seconds": round(multiplier * 35 + random.uniform(-5, 5), 1),
                "throughput": max(0, int(base_volume * 0.85 + random.randint(-100, 100))),
                "incidents": random.randint(0, 3) if multiplier > 0.5 else 0,
                "congestion_index": round(min(1.0, multiplier * 0.9 + random.uniform(-0.1, 0.1)), 2),
            })
        return stats

    # ---- Public API ----

    def tick(self):
        """Public method to advance simulation."""
        self._simulation_tick()

    def get_grid_state(self) -> dict:
        """Get full grid state for the dashboard."""
        with self._lock:
            intersections = [i.to_dict() for i in self.intersections.values()]

            total_vehicles = sum(i.total_vehicles_passed for i in self.intersections.values())
            avg_congestion = sum(i.congestion_level for i in self.intersections.values()) / max(1, len(self.intersections))
            avg_wait = sum(i.avg_wait_time for i in self.intersections.values()) / max(1, len(self.intersections))
            total_throughput = sum(i.throughput_per_hour for i in self.intersections.values())

            active_incidents = [inc for inc in self.incidents if not inc.resolved]
            emergency_intersections = [
                i.id for i in self.intersections.values() if i.emergency_preemption
            ]

            return {
                "grid_rows": self.grid_rows,
                "grid_cols": self.grid_cols,
                "ns_streets": self.ns_streets,
                "ew_streets": self.ew_streets,
                "intersections": intersections,
                "summary": {
                    "total_intersections": self.total_intersections,
                    "total_vehicles_passed": total_vehicles,
                    "avg_congestion": round(avg_congestion, 2),
                    "avg_wait_seconds": round(avg_wait, 1),
                    "total_throughput_per_hour": round(total_throughput, 0),
                    "active_incidents": len(active_incidents),
                    "emergency_vehicles": self.emergency_vehicles_active,
                    "emergency_intersections": emergency_intersections,
                    "adaptive_mode_count": sum(
                        1 for i in self.intersections.values() if i.mode == "adaptive"
                    ),
                },
            }

    def get_intersection(self, intersection_id: str) -> Optional[dict]:
        with self._lock:
            intersection = self.intersections.get(intersection_id)
            if intersection:
                return intersection.to_dict()
            return None

    def update_signal_timing(
        self,
        intersection_id: str,
        ns_green: Optional[int] = None,
        ew_green: Optional[int] = None,
        yellow: Optional[int] = None,
        mode: Optional[str] = None,
    ) -> Optional[dict]:
        with self._lock:
            intersection = self.intersections.get(intersection_id)
            if not intersection:
                return None
            if ns_green is not None:
                intersection.ns_green_duration = max(10, min(90, ns_green))
            if ew_green is not None:
                intersection.ew_green_duration = max(10, min(90, ew_green))
            if yellow is not None:
                intersection.yellow_duration = max(3, min(10, yellow))
            if mode is not None and mode in ("fixed", "adaptive", "manual"):
                intersection.mode = mode
            intersection.cycle_time = (
                intersection.ns_green_duration
                + intersection.ew_green_duration
                + 2 * intersection.yellow_duration
            )
            return intersection.to_dict()

    def trigger_emergency_preemption(
        self, intersection_id: str, direction: str
    ) -> Optional[dict]:
        with self._lock:
            intersection = self.intersections.get(intersection_id)
            if not intersection:
                return None
            intersection.emergency_preemption = True
            intersection.emergency_direction = direction
            intersection.mode = "emergency"
            self.emergency_vehicles_active += 1
            return intersection.to_dict()

    def clear_emergency_preemption(self, intersection_id: str) -> Optional[dict]:
        with self._lock:
            intersection = self.intersections.get(intersection_id)
            if not intersection:
                return None
            if intersection.emergency_preemption:
                intersection.emergency_preemption = False
                intersection.emergency_direction = None
                intersection.mode = "adaptive"
                self.emergency_vehicles_active = max(0, self.emergency_vehicles_active - 1)
            return intersection.to_dict()

    def get_incidents(self) -> list[dict]:
        with self._lock:
            return [inc.to_dict() for inc in self.incidents]

    def create_incident(
        self,
        incident_type: str,
        intersection_id: str,
        direction: str,
        severity: float,
        description: str,
        duration_minutes: int = 30,
    ) -> dict:
        with self._lock:
            incident = TrafficIncident(
                incident_type=IncidentType(incident_type),
                intersection_id=intersection_id,
                direction=direction,
                severity=min(1.0, max(0.0, severity)),
                description=description,
                duration_minutes=duration_minutes,
            )
            self.incidents.append(incident)
            return incident.to_dict()

    def resolve_incident(self, incident_id: str) -> Optional[dict]:
        with self._lock:
            for inc in self.incidents:
                if inc.id == incident_id:
                    inc.resolved = True
                    inc.resolved_at = datetime.utcnow().isoformat()
                    return inc.to_dict()
            return None

    def get_historical_data(self) -> list[dict]:
        with self._lock:
            return self.hourly_stats

    def optimize_corridor(self, street: str, direction: str = "ns") -> dict:
        """Run green wave optimization for a corridor."""
        with self._lock:
            optimized = []
            if direction == "ns":
                # Optimize a north-south street (column)
                col_idx = self.ns_streets.index(street) if street in self.ns_streets else -1
                if col_idx < 0:
                    return {"error": "Street not found", "optimized": []}
                for r in range(self.grid_rows):
                    iid = f"int-{r}-{col_idx}"
                    intersection = self.intersections.get(iid)
                    if intersection:
                        # Calculate optimal offset for green wave
                        # Assuming 35mph speed, ~300ft blocks = ~5.8s travel time
                        intersection.offset = r * 6
                        intersection.ns_green_duration = max(
                            intersection.ns_green_duration, 35
                        )
                        intersection.cycle_time = (
                            intersection.ns_green_duration
                            + intersection.ew_green_duration
                            + 2 * intersection.yellow_duration
                        )
                        optimized.append(intersection.to_dict())
            else:
                # Optimize east-west street (row)
                row_idx = self.ew_streets.index(street) if street in self.ew_streets else -1
                if row_idx < 0:
                    return {"error": "Street not found", "optimized": []}
                for c in range(self.grid_cols):
                    iid = f"int-{row_idx}-{c}"
                    intersection = self.intersections.get(iid)
                    if intersection:
                        intersection.offset = c * 6
                        intersection.ew_green_duration = max(
                            intersection.ew_green_duration, 35
                        )
                        intersection.cycle_time = (
                            intersection.ns_green_duration
                            + intersection.ew_green_duration
                            + 2 * intersection.yellow_duration
                        )
                        optimized.append(intersection.to_dict())

            return {
                "corridor": street,
                "direction": direction,
                "optimized_count": len(optimized),
                "intersections": optimized,
                "strategy": "green_wave",
                "offset_interval_seconds": 6,
            }

    def get_analytics(self) -> dict:
        """Get aggregate analytics for the entire network."""
        with self._lock:
            intersections = list(self.intersections.values())
            n = len(intersections)

            congestion_by_intersection = sorted(
                [{"id": i.id, "name": i.name, "congestion": round(i.congestion_level, 2)}
                 for i in intersections],
                key=lambda x: x["congestion"],
                reverse=True,
            )

            # Direction flow totals
            direction_flow = {"north": 0.0, "south": 0.0, "east": 0.0, "west": 0.0}
            for i in intersections:
                for d in direction_flow:
                    direction_flow[d] += i.flow_rates[d]

            return {
                "network_congestion": round(
                    sum(i.congestion_level for i in intersections) / n, 2
                ),
                "network_avg_wait": round(
                    sum(i.avg_wait_time for i in intersections) / n, 1
                ),
                "network_throughput": round(
                    sum(i.throughput_per_hour for i in intersections), 0
                ),
                "total_vehicles_today": sum(i.total_vehicles_passed for i in intersections),
                "busiest_intersections": congestion_by_intersection[:5],
                "quietest_intersections": congestion_by_intersection[-5:],
                "direction_flow": {k: round(v, 1) for k, v in direction_flow.items()},
                "mode_distribution": {
                    "adaptive": sum(1 for i in intersections if i.mode == "adaptive"),
                    "fixed": sum(1 for i in intersections if i.mode == "fixed"),
                    "manual": sum(1 for i in intersections if i.mode == "manual"),
                    "emergency": sum(1 for i in intersections if i.mode == "emergency"),
                },
                "historical": self.hourly_stats,
            }


# Singleton engine instance
engine = TrafficEngine()
