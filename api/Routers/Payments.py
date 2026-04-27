from fastapi import APIRouter, HTTPException, Depends
from Integrations.pinecone_client import supabase
from Schemas.PaymentSchemas import PaymentMethodCreate
from datetime import datetime
from Services.auth_dependency import get_current_user

router = APIRouter(tags=["Payment Details End-Points"])

@router.post("/add-methods")
async def create_payment_method(payload: PaymentMethodCreate, current_user  = Depends(get_current_user)):
    try:

        result = supabase.table("DimUserPaymentDetails").insert({
        "user_id": payload.user_id,
        "payment_method_type": payload.payment_method_type,
        "bank_name": payload.bank_name,
        "account_holder_name": payload.account_holder_name,
        "card_brand": payload.card_brand,
        "currency_code": payload.currency_code,
        "expiration_date": payload.expiration_date,
        "Is_default_method": payload.Is_default_method
        }).execute()
        
        return {
                "status": "success",
                "message": "Payment method added successfully",
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to insert payment method: {str(e)}")

@router.get("/get_method")
async def get_payment_methods(user_id: str,current_user  = Depends(get_current_user)):
    try:
        result = supabase.table("DimUserPaymentDetails").select("*").eq("user_id", user_id).is_("deleted_at", None).order("created_at", desc=True).execute()
        return {
            "status": "success",
            "user_id": user_id,
            "total_methods": len(result.data),
            "payment_methods": result.data,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch payment methods: {str(e)}")

@router.delete("/delete-method")
async def delete_payment_method(payment_details_id: str, current_user  = Depends(get_current_user)):
    try:
        supabase.table("DimUserPaymentDetails").update({"deleted_at": datetime.utcnow()}).eq("payment_details_id", payment_details_id).execute()

        return {
                "status": "success",
                "message": "Payment method deleted successfully",
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete payment method: {str(e)}")

@router.get("/payment-history")
async def get_payment_transactions(user_id: str, current_user  = Depends(get_current_user)):
    try:
        result = supabase.table("FactPaymentTransactions").select("*").eq("user_id", user_id).order("transaction_time", desc=True).execute()

        transactions = result.data or []

        return {
            "status": "success",
            "user_id": user_id,
            "total_transactions": len(transactions),
            "transactions": transactions
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch payment transactions: {str(e)}"
        )

