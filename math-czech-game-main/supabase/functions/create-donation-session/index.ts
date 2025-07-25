
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !stripeKey) {
      throw new Error("Missing environment variables.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { amount, currency, message, donorName, donorEmail } = await req.json();

    if (!amount || !currency || amount < 5000) { // minimum 50 CZK/EUR in cents
      throw new Error("Invalid donation amount or currency. Minimum is 50 CZK/0.5 EUR.");
    }
    
    // Get user if authenticated
    let userId = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      // Re-create client with auth context
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
      }
    }

    // Insert initial donation record
    const { data: donation, error: insertError } = await supabaseAdmin
      .from("donations")
      .insert({
        user_id: userId,
        amount: amount, // amount is already in cents
        currency,
        message,
        donor_name: donorName,
        donor_email: donorEmail,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting donation:", insertError);
      throw insertError;
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: "Dobrovolný příspěvek",
              description: "Děkujeme za vaši podporu!",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/donation-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/`,
      metadata: {
        donation_id: donation.id,
      },
      ...(donorEmail && { customer_email: donorEmail }),
    });

    const { error: updateError } = await supabaseAdmin
      .from("donations")
      .update({ stripe_session_id: session.id })
      .eq("id", donation.id);

    if (updateError) {
      console.error("Error updating donation with session ID:", updateError);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error creating donation session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
