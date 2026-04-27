from pydantic import BaseModel
from typing import Optional


class PaymentMethodCreate(BaseModel):
    user_id: str
    payment_method_type: str  # card, bank, wallet
    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None
    card_brand: Optional[str] = None
    currency_code: Optional[str] = None
    expiration_date: Optional[str] = None
    Is_default_method: Optional[bool] = False