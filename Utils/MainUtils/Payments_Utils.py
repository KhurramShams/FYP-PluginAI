from fastapi import HTTPException
import uuid
import random
from Integrations.pinecone_client import supabase

def fake_payment(amount: int, user_id: str , plan_id: str, currency: str = "usd"):
    try: 
        payment_id = f"fake_{uuid.uuid4().hex[:10]}"
        client_secret = f"secret_{uuid.uuid4().hex[:20]}"
        
        status = random.choice(["succeeded", "failed"])

         # Retrieve payment details
        payment_details = supabase.table("DimUserPaymentDetails").select("*").eq("user_id", user_id).execute()
        
        if not payment_details.data:
            raise HTTPException(status_code=404, detail="Payment Details not found")
        
        payment_details = payment_details.data[0]

        # Log payment details for debugging (remove in production)
        print(f"Payment Details Retrieved: {payment_details}")

        # Access the payment_details_id instead of 'id'
        payment_details_id = payment_details["payment_details_id"]  # Correct field

        if not payment_details_id:
            raise HTTPException(status_code=404, detail="Payment details 'payment_details_id' not found")
 # 6. Insert into payment_transaction
        transaction_record = {
            "user_id": user_id,
            "payment_reference_number": payment_id,
            "subscription_package_code": plan_id,
            "amount": float(amount),
            "currency": currency,
            "status": status,
            "payment_details_id": payment_details_id
        }

        response=supabase.table("FactPaymentTransactions").insert(transaction_record).execute()
        new_record_id = response.data[0]["id"]

        return {
            "payment_transaction_id" : new_record_id,
            "id":payment_id,
            "client_secret": client_secret,
            "amount": amount,
            "currency": currency,
            "status": status,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during payment process: {str(e)}")

def normalize_limit(value, default_unlimited=5_000_000):
    if isinstance(value, str) and value.strip().lower() == "unlimited":
        return default_unlimited
    if value is None:
        return 0
    return int(value)

def insert_into_FactAllPaymentTransactions(transaction_id:str, subscription_id:str, user_id: str, purpose: str):
    try:

        payment_record = {
            "transaction_id": transaction_id,
            "subscription_id":subscription_id,
            "user_id": user_id,
            "purpose" : purpose
        }
        PaymentUpdate=supabase.table("FactAllPaymentTransactions").insert(payment_record).execute()

        if not PaymentUpdate.data:
            raise HTTPException(status_code=400, detail="Failed to renew subscription")
        
        return {
            "message": "succeeded",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during insert into FactAllPaymentTransactions: {str(e)}")


