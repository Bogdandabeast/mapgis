# Supabase Auth Specification

## Purpose

Authentication and session management for mapgis, backed by Supabase Auth. Handles user registration, login (email/password + Google OAuth), persistent sessions, role-gated route protection, and profile provisioning.

## Requirements

### Requirement: User Registration

The system MUST allow visitors to create an account using email/password or Google OAuth. On successful sign-up, a Postgres trigger on `auth.users` INSERT MUST atomically create a profiles row with role `authenticated`. The trigger function (e.g., `on_auth_user_insert`) SHALL include an existence check to avoid duplicate profiles and SHALL run inside the same transaction that creates the auth user. Client-side sign-up flows (email/password handlers and OAuth callbacks) MUST NOT insert profiles directly — the DB trigger is the sole source of truth for profile provisioning.

#### Scenario: Email sign-up success
- GIVEN a visitor on the registration page
- WHEN they submit valid email and password
- THEN a Supabase auth user is created AND the `on_auth_user_insert` trigger atomically inserts a profiles row with role `authenticated`

#### Scenario: Google OAuth sign-up
- GIVEN a visitor on the registration page
- WHEN they authenticate via Google OAuth
- THEN a Supabase auth user is created with identity linked AND a profiles row is provisioned

#### Scenario: Duplicate email rejected
- GIVEN an email already registered
- WHEN a visitor attempts sign-up with that email
- THEN the client receives an auth error AND no duplicate profile is created

### Requirement: User Login

The system MUST authenticate registered users via email/password or Google OAuth, creating a persistent Supabase session.

#### Scenario: Email login success
- GIVEN a registered user
- WHEN they submit correct credentials
- THEN a session is created AND the user is redirected to the main app

#### Scenario: Invalid credentials
- GIVEN a registered user
- WHEN they submit an incorrect password
- THEN an error message is displayed AND no session is created

### Requirement: Session Persistence

The system MUST persist the Supabase session across app restarts and MUST silently refresh expired access tokens.

#### Scenario: App restart preserves session
- GIVEN a user with an active session
- WHEN the app is closed and reopened
- THEN the user remains authenticated without re-login

#### Scenario: Token refresh
- GIVEN a user with an active session whose access token expires
- WHEN the app makes an API call
- THEN the token is silently refreshed AND the call succeeds

### Requirement: Auth Gate

The system MUST protect authenticated-only routes by redirecting visitors without an active session to the login page.

#### Scenario: Unauthenticated access blocked
- GIVEN a visitor without a session
- WHEN they navigate to a protected route
- THEN they are redirected to the login page

#### Scenario: Authenticated access granted
- GIVEN a user with an active session
- WHEN they navigate to a protected route
- THEN the route renders normally

### Requirement: Role-Based Access

The system MUST expose the user's role (`visitor`, `authenticated`, `premium`, `admin`) and conditionally render features based on it. The `visitor` role SHALL be determined by the absence of an active session (no session/token). The `authenticated`, `premium`, and `admin` roles SHALL be derived from the profiles table's `role` column (`profiles.role`). Conditional-rendering requirements and examples MUST reference these exact sources.

#### Scenario: Premium features hidden from free user
- GIVEN a user with role `authenticated`
- WHEN they view the plan creation form
- THEN premium-only options (recurring, featured pin) are hidden

#### Scenario: Admin sees management UI
- GIVEN a user with role `admin`
- WHEN they open the app
- THEN category management and user moderation UI is visible

### Requirement: Logout

The system MUST terminate the current session and clear all locally stored session data on logout.

#### Scenario: User logs out
- GIVEN an authenticated user
- WHEN they trigger logout
- THEN the session is destroyed AND the user is redirected to the login page
