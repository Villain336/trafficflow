from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from app.engine import engine

app = FastAPI(
    title="TrafficFlow",
    description="Intelligent Traffic Signal Control & Pattern Optimization Platform",
    version="0.1.0",
)

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


# ---- Grid & Dashboard ----

@app.get("/api/grid")
async def get_grid():
    """Get full traffic grid state with all intersections."""
    engine.tick()
    return engine.get_grid_state()


@app.get("/api/intersection/{intersection_id}")
async def get_intersection(intersection_id: str):
    """Get details for a single intersection."""
    result = engine.get_intersection(intersection_id)
    if not result:
        raise HTTPException(status_code=404, detail="Intersection not found")
    return result


# ---- Signal Control ----

class SignalTimingUpdate(BaseModel):
    ns_green: Optional[int] = None
    ew_green: Optional[int] = None
    yellow: Optional[int] = None
    mode: Optional[str] = None


@app.put("/api/intersection/{intersection_id}/timing")
async def update_signal_timing(intersection_id: str, update: SignalTimingUpdate):
    """Update signal timing for an intersection."""
    result = engine.update_signal_timing(
        intersection_id,
        ns_green=update.ns_green,
        ew_green=update.ew_green,
        yellow=update.yellow,
        mode=update.mode,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Intersection not found")
    return result


class EmergencyRequest(BaseModel):
    direction: str


@app.post("/api/intersection/{intersection_id}/emergency")
async def trigger_emergency(intersection_id: str, req: EmergencyRequest):
    """Trigger emergency vehicle preemption at an intersection."""
    if req.direction not in ("north", "south", "east", "west"):
        raise HTTPException(status_code=400, detail="Invalid direction")
    result = engine.trigger_emergency_preemption(intersection_id, req.direction)
    if not result:
        raise HTTPException(status_code=404, detail="Intersection not found")
    return result


@app.post("/api/intersection/{intersection_id}/emergency/clear")
async def clear_emergency(intersection_id: str):
    """Clear emergency preemption at an intersection."""
    result = engine.clear_emergency_preemption(intersection_id)
    if not result:
        raise HTTPException(status_code=404, detail="Intersection not found")
    return result


# ---- Incidents ----

@app.get("/api/incidents")
async def get_incidents():
    """Get all traffic incidents."""
    return {"incidents": engine.get_incidents()}


class IncidentCreate(BaseModel):
    incident_type: str
    intersection_id: str
    direction: str
    severity: float
    description: str
    duration_minutes: int = 30


@app.post("/api/incidents")
async def create_incident(req: IncidentCreate):
    """Report a new traffic incident."""
    valid_types = ("accident", "construction", "weather", "event", "breakdown")
    if req.incident_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Type must be one of {valid_types}")
    return engine.create_incident(
        incident_type=req.incident_type,
        intersection_id=req.intersection_id,
        direction=req.direction,
        severity=req.severity,
        description=req.description,
        duration_minutes=req.duration_minutes,
    )


@app.post("/api/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str):
    """Mark an incident as resolved."""
    result = engine.resolve_incident(incident_id)
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    return result


# ---- Optimization ----

class OptimizeRequest(BaseModel):
    street: str
    direction: str = "ns"


@app.post("/api/optimize/corridor")
async def optimize_corridor(req: OptimizeRequest):
    """Run green wave optimization for a corridor."""
    if req.direction not in ("ns", "ew"):
        raise HTTPException(status_code=400, detail="Direction must be 'ns' or 'ew'")
    return engine.optimize_corridor(req.street, req.direction)


# ---- Analytics ----

@app.get("/api/analytics")
async def get_analytics():
    """Get network-wide traffic analytics."""
    return engine.get_analytics()


@app.get("/api/analytics/historical")
async def get_historical():
    """Get 24-hour historical traffic data."""
    return {"data": engine.get_historical_data()}


# ---- Simulation Control ----

@app.post("/api/sim/tick")
async def sim_tick():
    """Advance simulation by one tick."""
    engine.tick()
    return {"sim_time": engine.sim_time}
