import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Depends
from Integrations.pinecone_client import supabase
from Utils.MainUtils.Payments_Utils import fake_payment, normalize_limit,insert_into_FactAllPaymentTransactions
from datetime import date, timedelta
from fastapi import HTTPException
from datetime import date, timedelta
from fastapi import HTTPException
from Services.activity_logger import log_plan_cancelled, log_plan_upgrade, log_payment
from Services.email_service import send_payment_failed_email,send_payment_success_email,send_plan_activation_email,send_plan_renewal_email,send_plan_cancel_email
from Utils.MainUtils.Workspace_Utils import delete_workspace_completely
from Services.auth_dependency import get_current_user, verify_2fa_session

router = APIRouter(tags=["Subscription End-Points"])

@router.post("/get_all_plans")
async def get_all_plans():
    try:
        plans = supabase.table("DimSubscriptionPackages").select("*").execute()
        if plans is None:
            raise HTTPException(status_code=404, detail="No subscription plans found")
        return plans
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching subscription plans: {str(e)}")

@router.post("/activate")
async def subscribe_plane(Requests: Request, background_tasks: BackgroundTasks, subscription_plan_code : str, current_user: dict = Depends(verify_2fa_session)):
    try:
        user_id = current_user["user_id"]
        # 1. Validate user
        user_data = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        user = user_data.data[0]

        # 2. Validate subscription package
        plan = supabase.table("DimSubscriptionPackages").select("*").eq("subscription_code", subscription_plan_code).execute()
        if not plan.data:
            raise HTTPException(status_code=404, detail="Subscription plan not found")
        plan = plan.data[0]

        # 3. Check if user already has an active subscription
        existing_subscription = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).eq("status", "active").execute()
        if existing_subscription.data:
            raise HTTPException(status_code=400, detail="User already has an active subscription")

         # 4. Fake payment process
        payment = fake_payment(amount=plan["price"], user_id=user_id, plan_id=subscription_plan_code, currency="usd")
        
        # payment Log Activity
        background_tasks.add_task(
        log_payment,
        user_id =user_id,
        status = payment["status"],        
        plan = subscription_plan_code,
        amount = plan["price"],
        request = Requests,
        )

        if payment["status"] != "succeeded":
            background_tasks.add_task(
            send_payment_failed_email,
            to_email = user['email'],
            plan_name = subscription_plan_code,
            amount = plan["price"],
            )
            raise HTTPException(status_code=402, detail="Payment failed")
        
        background_tasks.add_task(
            send_payment_success_email,
            to_email = user['email'],
            plan_name = subscription_plan_code,
            amount = plan["price"],
            invoice_id = payment ["payment_transaction_id"]
        )

        # 4. Calculate subscription dates
        start_date = date.today()
        end_date = start_date + timedelta(days=30)  # assuming 1 month plan
        renewal_date = end_date

        subscription_id = str(uuid.uuid4())

         # 5. Insert into user_subscriptions
        sub_record = {
            "subscription_id": subscription_id,
            "subscription_package_code": subscription_plan_code,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(), 
            "status": "active",
            "payment_status": "paid",
            "renewal_date": renewal_date.isoformat(),
            "user_id": user_id,
            "payment_transaction_id": payment ["payment_transaction_id"]
        }

        inserted = supabase.table("DimUserSubscriptions").insert(sub_record).execute()
        subscription = inserted.data[0]
    
        usage_data = {
            "max_upload_docs": normalize_limit(plan["document_upload_limit"] * plan["workspaces"]),
            "user_uploded_docs": 0,
            "max_query": normalize_limit(plan["query_limit"] * plan["workspaces"]),
            "user_query": 0,
            "max_api": normalize_limit(plan["api_keys_limit"] * plan["workspaces"]),
            "user_api": 0,
            "max_token": normalize_limit(plan["max_tokens"] * plan["workspaces"]),
            "user_token": 0,
            "max_workspace": normalize_limit(plan["workspaces"]),
            "user_workspace": 0,
            "subscription_id": subscription["subscription_id"],
            "status": "active",
        }

        # Insert if not exist
        existing = supabase.table("FactSubscriptionUsage").select("*").eq("subscription_id", subscription["subscription_id"]).execute()

        if not existing.data:
            supabase.table("FactSubscriptionUsage").insert(usage_data).execute()
        
        # Payment Details
        insert_into_FactAllPaymentTransactions ( payment ["payment_transaction_id"],subscription["subscription_id"],user_id,"New_Subscription")

        # Send Email..
        background_tasks.add_task(
            send_plan_activation_email,
            to_email = user['email'],
            plan_name = subscription_plan_code,
            features = subscription_plan_code
        )

        return {
            "message": "Subscription activated successfully",
            "subscription": subscription,
            "payment": payment,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during activation: {str(e)}")

@router.post("/cancel")
async def cancel_subscription(Requests: Request, background_tasks: BackgroundTasks, subscription_id: str, current_user: dict = Depends(verify_2fa_session)):
    try:
        if not subscription_id:
            raise HTTPException(status_code=400, detail="Provide subscription_id")

            # 1. Validate subscription directly with subscription_id
        subscription = supabase.table("DimUserSubscriptions").select("*").eq("subscription_id", subscription_id).eq("status", "active").execute()
        if not subscription.data:
            raise HTTPException(status_code=404, detail="Subscription not found")
        subscription = subscription.data[0]

        user_id_real = subscription["user_id"]

        if user_id_real != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Access denied")

        user_data = supabase.table("DimUsers").select("*").eq("user_id", user_id_real).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = user_data.data[0]
        to_email = user['email']

        # 3. Cancel subscription
        updated = supabase.table("DimUserSubscriptions").delete().eq("subscription_id", subscription_id).execute()
        if not updated.data:
            raise HTTPException(status_code=400, detail="Failed to cancel subscription")

        # 4. Delete usage data associated with the subscription
        supabase.table("FactSubscriptionUsage").delete().eq("subscription_id",subscription_id).execute()
        
        # 5. Fetch all workspaces associated with the subscription
        subdata = supabase.table("DimWorkSpaces").select("*").eq("subscription_id", subscription_id).execute()

        if not subdata.data:
            pass 
        else:
            for workspace in subdata.data:
                workspace_name = workspace["workspace_name"]  # or any other field that uniquely identifies the workspace
                print(f'Enter Function : {workspace_name}')
                await delete_workspace_completely(workspace_name)

        background_tasks.add_task(
        log_plan_cancelled,
        user_id = user_id_real,
        plan = subscription["subscription_package_code"],
        request = Requests,
        )

        background_tasks.add_task(
        send_plan_cancel_email,
        to_email = to_email,
        plan_name = subscription["subscription_package_code"],
        end_date = date.today(),
        )

        return {"message": "Subscription cancelled successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during cancellation: {str(e)}")

@router.post("/renew")
async def renew_subscription(Requests: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(verify_2fa_session)):
    try:
        user_id = current_user["user_id"]
        # 1. Validate user
        user_data = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        user = user_data.data[0]

        # 2. Validate subscription
        subscription = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        if not subscription.data:
            raise HTTPException(status_code=404, detail="Subscription not found")
        subscription = subscription.data[0]

        # 3. Check if the subscription is already active and payment has been made
        if subscription["status"] != "active":
            raise HTTPException(status_code=400, detail="Subscription is not active")

        # Get New Amount
        package=supabase.table("DimSubscriptionPackages").select("*").eq("subscription_code", subscription["subscription_package_code"]).execute()
        package = package.data[0]

        # 4. Process Payment (fake or real payment logic)
        payment = fake_payment(amount =package["price"], user_id=user_id, plan_id=subscription["subscription_package_code"], currency="usd")
        if payment["status"] != "succeeded":
            raise HTTPException(status_code=402, detail="Payment failed")

        # 5. Renew the subscription after successful payment
        new_renewal_date = date.today() + timedelta(days=30)  # Example: 30 days renewal
        updated = supabase.table("DimUserSubscriptions").update({
            "renewal_date": new_renewal_date.isoformat(), 
            "end_date":new_renewal_date.isoformat(),
            "payment_transaction_id":payment["payment_transaction_id"],
            }).eq("subscription_id", subscription["subscription_id"]).execute()

        if not updated.data:
            raise HTTPException(status_code=400, detail="Failed to renew subscription")

        # Payment Details
        insert_into_FactAllPaymentTransactions(payment ["payment_transaction_id"],subscription["subscription_id"], user_id,"Renew_Subscription")

        background_tasks.add_task(
        log_plan_upgrade,
        user_id = user_id,
        plan = subscription["subscription_package_code"],
        request = Requests,
        ) 

        background_tasks.add_task(
        send_plan_renewal_email,
        to_email = user_data['email'],
        renewal_date = date.today(),
        amount = package["price"],
        )

        return {
            "message": "Subscription renewed successfully",
            "subscription": updated.data[0]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during renewal: {str(e)}")

@router.post("/get_subscription_details")
async def get_subscription_details(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        # 1. Validate user
        user_data = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        user = user_data.data[0]

        # 2. Validate subscription
        subscription = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        if not subscription.data:
            raise HTTPException(status_code=404, detail="Subscription not found")
        subscription = subscription.data[0]

        return {
            "message": "Subscription details fetched successfully",
            "subscription": subscription,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during fetching subscription details: {str(e)}")

@router.get("/subscriptions_status")
async def get_subscriptions_status(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user["user_id"]
        # 1. Validate user
        user_data = supabase.table("DimUsers").select("*").eq("user_id", user_id).execute()
        if not user_data.data:
            raise HTTPException(status_code=404, detail="User not found")
        user = user_data.data[0]

        # 2. Validate subscription
        subscription = supabase.table("DimUserSubscriptions").select("*").eq("user_id", user_id).execute()
        if not subscription.data:
            raise HTTPException(status_code=404, detail="Subscription not found")
        subscription = subscription.data[0]

        return {
            "message": "Subscription status fetched successfully",
            "subscription": subscription["status"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during fetching subscription status: {str(e)}")
