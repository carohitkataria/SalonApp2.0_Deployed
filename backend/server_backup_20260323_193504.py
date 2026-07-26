from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import socketio
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, time, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import io
import base64
import qrcode
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Socket.IO setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Socket.IO app
socket_app = socketio.ASGIApp(sio, app)

# ============ MODELS ============

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserLogin(BaseModel):
    name: str
    phone: str  # +91XXXXXXXXXX format

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    created_at: str

class BarberCreate(BaseModel):
    name: str
    experience: int  # years
    category: str  # "normal", "star", "master"
    mobile: str

class Barber(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    experience: int
    category: str
    mobile: str
    is_active: bool = True

class SalonLocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    salon_name: str
    address: str
    latitude: float
    longitude: float

class TokenCreate(BaseModel):
    customer_name: str
    phone: str  # +91XXXXXXXXXX
    date: str  # YYYY-MM-DD
    time_slot: str  # HH:MM
    barber_id: str
    barber_name: str
    source: str = "online"  # online or qr_walkin
    user_id: Optional[str] = None

class Token(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    token_number: int
    customer_name: str
    phone: str
    date: str
    time_slot: str
    barber_id: str
    barber_name: str
    status: str = "waiting"  # waiting, in_progress, completed, skipped
    source: str
    user_id: Optional[str] = None
    created_at: str

class TokenUpdate(BaseModel):
    status: Optional[str] = None

class Analytics(BaseModel):
    total_tokens: int
    waiting: int
    in_progress: int
    completed: int
    skipped: int
    current_tokens: List[int] = []
    max_token: int

# ============ AUTH HELPERS ============

def create_access_token(data: dict):
    to_encode = data.copy()
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.InvalidTokenError:
        return None

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    return payload

# ============ INITIALIZATION ============

async def initialize_data():
    # Initialize barbers if none exist
    barber_count = await db.barbers.count_documents({})
    if barber_count == 0:
        barbers = [
            {
                "id": str(uuid.uuid4()),
                "name": "Rajesh Kumar",
                "experience": 8,
                "category": "master",
                "mobile": "+919876543210",
                "is_active": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Amit Sharma",
                "experience": 5,
                "category": "star",
                "mobile": "+919876543211",
                "is_active": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Vikram Singh",
                "experience": 3,
                "category": "normal",
                "mobile": "+919876543212",
                "is_active": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Arjun Patel",
                "experience": 6,
                "category": "star",
                "mobile": "+919876543213",
                "is_active": True
            }
        ]
        await db.barbers.insert_many(barbers)
    
    # Initialize salon location if not exists
    salon_count = await db.salon_location.count_documents({})
    if salon_count == 0:
        salon = {
            "salon_name": "The Looks Unisex Salon",
            "address": "123 Main Street, Bangalore, Karnataka",
            "latitude": 12.9716,
            "longitude": 77.5946
        }
        await db.salon_location.insert_one(salon)

async def reset_daily_tokens():
    logger.info("Running daily token reset...")
    # Tokens are date-specific, no need to delete

# ============ HELPER FUNCTIONS ============

async def get_next_token_number(date: str) -> int:
    tokens = await db.tokens.find({"date": date}, {"_id": 0}).sort("token_number", -1).limit(1).to_list(1)
    if tokens:
        return tokens[0]["token_number"] + 1
    return 1

def generate_time_slots(date_str: str) -> List[str]:
    parsed_date = datetime.fromisoformat(date_str).date()
    day_of_week = parsed_date.weekday()  # 0=Monday, 6=Sunday
    
    if day_of_week == 1:  # Tuesday closed
        return []
    
    if day_of_week == 6:  # Sunday
        start_hour = 6
        end_hour = 23
    else:  # Other days
        start_hour = 9
        end_hour = 23
    
    slots = []
    current = datetime.combine(parsed_date, time(start_hour, 0))
    end = datetime.combine(parsed_date, time(end_hour, 0))
    
    while current <= end:
        slots.append(current.strftime("%H:%M"))
        current += timedelta(minutes=20)
    
    return slots

async def broadcast_update(event_type: str, data: dict):
    """Broadcast updates via WebSocket"""
    await sio.emit(event_type, data)

# ============ WEBSOCKET EVENTS ============

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

# ============ API ROUTES ============

@api_router.get("/")
async def root():
    return {"message": "The Looks Unisex Salon API v2.0"}

# ============ AUTH ROUTES ============

@api_router.post("/auth/admin/login", response_model=AdminToken)
async def admin_login(credentials: AdminLogin):
    # Hardcoded admin for now
    if credentials.username == "admin" and credentials.password == "admin123":
        token = create_access_token({"sub": "admin", "role": "admin"})
        return AdminToken(access_token=token)
    raise HTTPException(status_code=401, detail="Invalid credentials")

@api_router.post("/auth/user/login", response_model=User)
async def user_login(credentials: UserLogin):
    # Validate phone format
    phone = credentials.phone
    if not phone.startswith("+91"):
        phone = f"+91{phone}"
    
    if len(phone) != 13:  # +91 + 10 digits
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    # Check if user exists
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    
    if user:
        # Update name if changed
        if user["name"] != credentials.name:
            await db.users.update_one(
                {"phone": phone},
                {"$set": {"name": credentials.name}}
            )
            user["name"] = credentials.name
        return User(**user)
    else:
        # Create new user
        new_user = {
            "id": str(uuid.uuid4()),
            "name": credentials.name,
            "phone": phone,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_user)
        return User(**new_user)

# ============ BARBER ROUTES ============

@api_router.get("/barbers", response_model=List[Barber])
async def get_barbers():
    barbers = await db.barbers.find({"is_active": True}, {"_id": 0}).to_list(100)
    return barbers

@api_router.post("/barbers", response_model=Barber)
async def create_barber(barber: BarberCreate, admin=Depends(get_current_admin)):
    barber_dict = barber.model_dump()
    barber_dict["id"] = str(uuid.uuid4())
    barber_dict["is_active"] = True
    
    await db.barbers.insert_one(barber_dict)
    await broadcast_update("barber_updated", {"action": "created"})
    return Barber(**barber_dict)

@api_router.put("/barbers/{barber_id}", response_model=Barber)
async def update_barber(barber_id: str, barber: BarberCreate, admin=Depends(get_current_admin)):
    existing = await db.barbers.find_one({"id": barber_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    update_data = barber.model_dump()
    await db.barbers.update_one({"id": barber_id}, {"$set": update_data})
    
    updated = await db.barbers.find_one({"id": barber_id}, {"_id": 0})
    await broadcast_update("barber_updated", {"action": "updated", "barber_id": barber_id})
    return Barber(**updated)

@api_router.delete("/barbers/{barber_id}")
async def delete_barber(barber_id: str, admin=Depends(get_current_admin)):
    result = await db.barbers.update_one({"id": barber_id}, {"$set": {"is_active": False}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    await broadcast_update("barber_updated", {"action": "deleted", "barber_id": barber_id})
    return {"message": "Barber deleted"}

# ============ SALON LOCATION ROUTES ============

@api_router.get("/salon/location", response_model=SalonLocation)
async def get_salon_location():
    location = await db.salon_location.find_one({}, {"_id": 0})
    if not location:
        raise HTTPException(status_code=404, detail="Salon location not set")
    return SalonLocation(**location)

@api_router.put("/salon/location", response_model=SalonLocation)
async def update_salon_location(location: SalonLocation, admin=Depends(get_current_admin)):
    location_dict = location.model_dump()
    await db.salon_location.delete_many({})
    await db.salon_location.insert_one(location_dict)
    return location

# ============ TOKEN ROUTES ============

@api_router.get("/time-slots/{date}")
async def get_time_slots(date: str):
    slots = generate_time_slots(date)
    return {"slots": slots}

@api_router.post("/tokens", response_model=Token)
async def create_token(input: TokenCreate):
    # Validate date
    try:
        parsed_date = datetime.fromisoformat(input.date).date()
        if parsed_date.weekday() == 1:  # Tuesday
            raise HTTPException(status_code=400, detail="Salon is closed on Tuesdays")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    # Validate phone format
    phone = input.phone
    if not phone.startswith("+91"):
        phone = f"+91{phone}"
    
    if len(phone) != 13:
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    
    # Get next token number
    token_number = await get_next_token_number(input.date)
    
    token_dict = input.model_dump()
    token_dict["phone"] = phone
    token_dict["id"] = str(uuid.uuid4())
    token_dict["token_number"] = token_number
    token_dict["status"] = "waiting"
    token_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.tokens.insert_one(token_dict)
    
    token = Token(**token_dict)
    await broadcast_update("token_created", token.model_dump())
    return token

@api_router.get("/tokens", response_model=List[Token])
async def get_tokens(date: Optional[str] = None, status: Optional[str] = None, user_id: Optional[str] = None):
    query = {}
    if date:
        query["date"] = date
    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    
    tokens = await db.tokens.find(query, {"_id": 0}).sort("token_number", 1).to_list(1000)
    return tokens

@api_router.get("/tokens/current/{date}")
async def get_current_tokens(date: str):
    # Get all tokens currently in progress (max 4)
    current_tokens = await db.tokens.find(
        {"date": date, "status": "in_progress"},
        {"_id": 0}
    ).sort("token_number", 1).to_list(4)
    
    return [Token(**t) for t in current_tokens]

@api_router.get("/tokens/next/{date}")
async def get_next_tokens(date: str, limit: int = 3):
    # Get highest in_progress token number
    in_progress = await db.tokens.find(
        {"date": date, "status": "in_progress"},
        {"_id": 0}
    ).sort("token_number", -1).limit(1).to_list(1)
    
    current_token_number = in_progress[0]["token_number"] if in_progress else 0
    
    # Get next waiting tokens
    next_tokens = await db.tokens.find(
        {"date": date, "status": "waiting", "token_number": {"$gt": current_token_number}},
        {"_id": 0}
    ).sort("token_number", 1).limit(limit).to_list(limit)
    
    return [Token(**t) for t in next_tokens]

@api_router.patch("/tokens/{token_id}", response_model=Token)
async def update_token(token_id: str, update: TokenUpdate, admin=Depends(get_current_admin)):
    token = await db.tokens.find_one({"id": token_id}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    # If setting to in_progress, check if 4 tokens already in progress
    if update_data.get("status") == "in_progress":
        in_progress_count = await db.tokens.count_documents({
            "date": token["date"],
            "status": "in_progress"
        })
        if in_progress_count >= 4:
            raise HTTPException(status_code=400, detail="Maximum 4 tokens can be in progress")
    
    await db.tokens.update_one({"id": token_id}, {"$set": update_data})
    
    updated_token = await db.tokens.find_one({"id": token_id}, {"_id": 0})
    await broadcast_update("token_updated", Token(**updated_token).model_dump())
    return Token(**updated_token)

@api_router.get("/analytics/{date}", response_model=Analytics)
async def get_analytics(date: str):
    tokens = await db.tokens.find({"date": date}, {"_id": 0}).to_list(1000)
    
    total = len(tokens)
    waiting = len([t for t in tokens if t["status"] == "waiting"])
    in_progress_tokens = [t for t in tokens if t["status"] == "in_progress"]
    in_progress = len(in_progress_tokens)
    completed = len([t for t in tokens if t["status"] == "completed"])
    skipped = len([t for t in tokens if t["status"] == "skipped"])
    
    current_tokens = [t["token_number"] for t in in_progress_tokens]
    max_token = max([t["token_number"] for t in tokens]) if tokens else 0
    
    return Analytics(
        total_tokens=total,
        waiting=waiting,
        in_progress=in_progress,
        completed=completed,
        skipped=skipped,
        current_tokens=current_tokens,
        max_token=max_token
    )

# ============ STAFF CONTROL ROUTES ============

@api_router.post("/staff/next-token/{date}")
async def call_next_token(date: str, admin=Depends(get_current_admin)):
    # Check if less than 4 tokens in progress
    in_progress_count = await db.tokens.count_documents({"date": date, "status": "in_progress"})
    if in_progress_count >= 4:
        raise HTTPException(status_code=400, detail="Maximum 4 tokens already in progress")
    
    # Get next waiting token
    next_token = await db.tokens.find_one(
        {"date": date, "status": "waiting"},
        {"_id": 0},
        sort=[("token_number", 1)]
    )
    
    if next_token:
        await db.tokens.update_one(
            {"id": next_token["id"]},
            {"$set": {"status": "in_progress"}}
        )
        updated = Token(**{**next_token, "status": "in_progress"})
        await broadcast_update("token_called", updated.model_dump())
        return updated
    
    return {"message": "No more tokens in queue"}

@api_router.post("/staff/skip-token/{token_id}")
async def skip_token(token_id: str, admin=Depends(get_current_admin)):
    token = await db.tokens.find_one({"id": token_id}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    
    # Skip is final - cannot be recalled
    await db.tokens.update_one({"id": token_id}, {"$set": {"status": "skipped"}})
    await broadcast_update("token_skipped", {"token_id": token_id})
    return {"message": "Token skipped (final)"}

@api_router.post("/staff/recall-token/{token_id}")
async def recall_token(token_id: str, admin=Depends(get_current_admin)):
    token = await db.tokens.find_one({"id": token_id}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    
    # Only allow recall for completed tokens (not skipped)
    if token["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only recall completed tokens")
    
    # Check if less than 4 tokens in progress
    in_progress_count = await db.tokens.count_documents({"date": token["date"], "status": "in_progress"})
    if in_progress_count >= 4:
        raise HTTPException(status_code=400, detail="Maximum 4 tokens already in progress")
    
    await db.tokens.update_one({"id": token_id}, {"$set": {"status": "in_progress"}})
    await broadcast_update("token_recalled", {"token_id": token_id})
    return {"message": "Token recalled"}

@api_router.post("/staff/complete-token/{token_id}")
async def complete_token(token_id: str, admin=Depends(get_current_admin)):
    token = await db.tokens.find_one({"id": token_id}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    
    await db.tokens.update_one({"id": token_id}, {"$set": {"status": "completed"}})
    await broadcast_update("token_completed", {"token_id": token_id})
    return {"message": "Token completed"}

# ============ QR CODE ROUTE ============

@api_router.get("/qr-code")
async def generate_qr_code(admin=Depends(get_current_admin)):
    frontend_url = os.environ.get('FRONTEND_URL', 'https://md-revisions.preview.emergentagent.com')
    
    # QR code is permanent - no date/time in URL
    # Frontend will auto-fill current date/time when scanned
    booking_url = f"{frontend_url}/book?source=qr_walkin"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(booking_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    img_str = base64.b64encode(buffer.getvalue()).decode()
    
    return {
        "qr_code": f"data:image/png;base64,{img_str}",
        "booking_url": booking_url
    }

# ============ USER HISTORY ROUTE ============

@api_router.get("/user/{user_id}/history", response_model=List[Token])
async def get_user_history(user_id: str):
    tokens = await db.tokens.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tokens

@api_router.get("/user/{user_id}/active", response_model=List[Token])
async def get_user_active_bookings(user_id: str):
    today = datetime.now().date().isoformat()
    tokens = await db.tokens.find(
        {"user_id": user_id, "date": {"$gte": today}, "status": {"$in": ["waiting", "in_progress"]}},
        {"_id": 0}
    ).sort("date", 1).to_list(10)
    return tokens

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Scheduler for daily reset
scheduler = AsyncIOScheduler()
scheduler.add_job(reset_daily_tokens, 'cron', hour=0, minute=0)

@app.on_event("startup")
async def startup_event():
    await initialize_data()
    scheduler.start()
    logger.info("Application started with WebSocket support")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()

# Mount Socket.IO
app.mount("/", socket_app)
