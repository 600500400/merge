
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FeedbackRequest {
  category: string;
  message: string;
  name?: string;
  email?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { category, message, name, email }: FeedbackRequest = await req.json();

    // Get authorization header to identify user
    const authHeader = req.headers.get("authorization");
    let userId = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id || null;
    }

    // Store feedback in database
    const { data: feedbackData, error: dbError } = await supabase
      .from("feedback")
      .insert({
        user_id: userId,
        name: name || null,
        email: email || null,
        category,
        message,
        user_agent: req.headers.get("user-agent") || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error("Failed to save feedback");
    }

    // Check if RESEND_API_KEY is configured
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ 
          success: true, 
          id: feedbackData.id,
          warning: "Feedback saved but email not sent - RESEND_API_KEY not configured"
        }), 
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Send email notification
    const categoryMap: Record<string, string> = {
      bug: "🐛 Bug Report",
      feature: "💡 Feature Request", 
      general: "💬 General Feedback"
    };

    const emailSubject = `${categoryMap[category]} - Learning App Feedback`;
    
    const emailHtml = `
      <h2>${categoryMap[category]}</h2>
      <p><strong>Feedback ID:</strong> ${feedbackData.id}</p>
      <p><strong>Category:</strong> ${category}</p>
      ${name ? `<p><strong>Name:</strong> ${name}</p>` : ''}
      ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
      ${userId ? `<p><strong>User ID:</strong> ${userId}</p>` : '<p><strong>User:</strong> Anonymous</p>'}
      <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
      
      <h3>Message:</h3>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
        ${message.replace(/\n/g, '<br>')}
      </div>
      
      <hr style="margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">
        User Agent: ${req.headers.get("user-agent") || "Unknown"}
      </p>
    `;

    try {
      const emailResponse = await resend.emails.send({
        from: "Learning App <onboarding@resend.dev>",
        to: ["kamelpost@gmail.com"], // Změněno na vaši skutečnou email adresu
        subject: emailSubject,
        html: emailHtml,
      });

      console.log("Feedback saved and email sent:", feedbackData.id, "Email ID:", emailResponse.data?.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          id: feedbackData.id,
          emailId: emailResponse.data?.id 
        }), 
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    } catch (emailError: any) {
      console.error("Email sending error:", emailError);
      
      // Return success for database save but note email failure
      return new Response(
        JSON.stringify({ 
          success: true, 
          id: feedbackData.id,
          warning: "Feedback saved but email failed to send",
          emailError: emailError.message
        }), 
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  } catch (error: any) {
    console.error("Error in send-feedback function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
