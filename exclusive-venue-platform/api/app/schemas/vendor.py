"""Validation schemas for the vendor domain (erd.md §6, §6b). Mirrors
migrations/versions/0030_vendor_domain.py and 0031_vendor_services.py.
Deliberately parallels app/schemas/venue.py's shape — vendors get the
same approval-before-live mechanic as venues.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

VendorCategory = Literal[
    "florist", "catering", "lighting", "entertainment", "av", "staffing", "decor", "other"
]
VendorStatus = Literal["draft", "pending_approval", "active", "suspended"]
VendorMediaKind = Literal["photo", "video", "logo"]
VendorServicePricingType = Literal["flat", "per_head", "per_hour", "quote"]


class VendorCreate(BaseModel):
    business_name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    category: VendorCategory
    description: str | None = None
    contacts: str | None = None
    address: str | None = None
    district: str | None = None
    city: str | None = None
    region: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    service_area_radius_km: float | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    owner_user_id: UUID | None = None
    status: VendorStatus = "draft"


class VendorUpdate(BaseModel):
    business_name: str | None = Field(default=None, min_length=1)
    slug: str | None = Field(default=None, min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    category: VendorCategory | None = None
    description: str | None = None
    contacts: str | None = None
    address: str | None = None
    district: str | None = None
    city: str | None = None
    region: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    service_area_radius_km: float | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    status: VendorStatus | None = None


class Vendor(BaseModel):
    id: UUID
    owner_user_id: UUID
    business_name: str
    slug: str
    category: VendorCategory
    description: str | None
    contacts: str | None
    address: str | None
    district: str | None
    city: str | None
    region: str | None
    latitude: float | None
    longitude: float | None
    service_area_radius_km: float | None
    meta_title: str | None
    meta_description: str | None
    status: VendorStatus
    approved_by: UUID | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class VendorServiceCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    pricing_type: VendorServicePricingType
    amount: float | None = Field(default=None, ge=0)
    currency: str = "HKD"
    sort_order: int = 0


class VendorServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    pricing_type: VendorServicePricingType | None = None
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = None
    sort_order: int | None = None


class VendorService(BaseModel):
    id: UUID
    vendor_id: UUID
    name: str
    description: str | None
    pricing_type: VendorServicePricingType
    amount: float | None
    currency: str
    sort_order: int
