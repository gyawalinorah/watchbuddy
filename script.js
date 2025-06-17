const supabaseClient = supabase.createClient(
    "https://qyvqsuwtvqrcjcvqigdl.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5dnFzdXd0dnFyY2pjdnFpZ2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0Mzc3MjMsImV4cCI6MjA2NTAxMzcyM30.rbQsNrfmhHjXnnOc8UAFTrknEKYkXDuKcP-IMPm5TdI"
);

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        const email = session.user.email;
        document.getElementById(
            "userInfo"
        ).textContent = `✅ Logged in as ${email}`;
    } else {
        document.getElementById("userInfo").textContent =
            "❌ No active session. Please log in.";
    }
});
document.getElementById('chatToggleBtn').addEventListener('click', function () {
    document.getElementById('chatSection').classList.toggle('chat-open');
});

document.getElementById('closeChatBtn').addEventListener('click', function () {
    document.getElementById('chatSection').classList.remove('chat-open');
});