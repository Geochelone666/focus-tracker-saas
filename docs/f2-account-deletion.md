# Account deletion

Settings → Privacy and access → Delete your account provides permanent deletion
for password and email-verifiable accounts, including OAuth-only accounts with
an accessible account email. The person enters a current password or requests
an email code, types DELETE and checks the permanent-deletion acknowledgement. Export
links and the deletion scope appear before the form.

The server verifies the current session with GoTrue, derives the target ID and
email from that response, and reauthenticates using a separate anonymous client. Email code requests use
the verified owner's email and `shouldCreateUser:false`. A code is verified with
`verifyOtp` using type `email`; a different returned owner is rejected.
Its temporary session is signed out without writing browser cookies. The
reauthenticated user must match the original owner. For accounts with a verified TOTP factor, the form lists the owned authenticators
and asks for a current six-digit code. The independent verification session challenges
that factor, verifies the code, checks AAL2 and re-reads the user before deletion.
Other MFA methods still require an existing session at AAL2. OAuth-only accounts can use the email-code option.

A separate server-only admin client calls GoTrue's hard delete using the existing
SUPABASE_SERVICE_ROLE_KEY configuration. If the key is absent, the page shows an
unavailable message. The service-role key stays on the server. The action accepts
no target ID, and never returns the password or provider error details.

On an error or lost deletion response, the action queries the same owner's auth
record. Only an explicit 404 user_not_found confirms that deletion completed.
An existing account or an inconclusive result produces retry feedback. After
confirmed deletion, the browser signs out and returns to Login with a completion
message.

The existing foreign keys cascade from auth.users through the owner's profile,
skills, projects, tasks/Trash, focus sessions and segments, reflections, AI keys
and activity, device registrations and delivery work, calendar state, drafts,
receipts, locks and work preferences. No new table permission or migration is
introduced. An already-running request or notification may finish. Downloaded or
shared copies and hosting backups/logs follow their own retention settings; the
form explains this before confirmation. Actual backup retention must be verified
with the intended hosting configuration.

Validation uses mocked GoTrue boundaries, actual Next Server Actions in the
browser fixture, and SQL fixtures on disposable databases. The SQL regression
seeds all owned collections, deletes only its fixture account and checks for
orphans and preservation of a second account. The browser fixture rejects a
wrong password and authenticator code, verifies the owned TOTP factor, confirms deletion, deliberately loses its success response,
verifies absence through the admin lookup and returns to Login. It does not
contact hosted Supabase or delete an existing user.

Release still requires #55 hosted registry/schema reconciliation, two-user
hosted GoTrue acceptance, review of service-role access and a dedicated test
account deletion on the intended preview. Reverting this application increment
removes the deletion UI/action. An executed permanent deletion requires recovery
from an independently verified hosting backup and cannot be undone through the
application.


## Email delivery prerequisite

Supabase uses the Magic Link email template for `signInWithOtp`. The intended
project's template must include `{{ .Token }}` for the user to enter the code.
Configure and test the template with a dedicated account before enabling this
application increment. Check actual OTP length, expiry and sending limits
against the project configuration. The form accepts six to ten digits. The
provider enforces expiry and rate limits. This branch makes no hosted email
template or provider configuration change.

See the [Supabase passwordless email guide](https://supabase.com/docs/guides/auth/auth-email-passwordless)
for the template and `verifyOtp` contract. Local fixture delivery tests do not
verify real email delivery or provider identity linkage.
