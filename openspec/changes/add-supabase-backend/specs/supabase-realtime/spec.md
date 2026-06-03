# Supabase Realtime Specification

## Purpose

Real-time data synchronization via Supabase Realtime WebSocket subscriptions. Enables live plan notifications for category subscribers and immediate map updates without manual page refreshes.

## Requirements

### Requirement: Plan Creation Notification Broadcast

The system MUST push a notification in real time to all users subscribed to a category when a new plan is created in that category.

#### Scenario: Subscriber receives real-time notification
- GIVEN a user subscribed to category "Cycling"
- WHEN another user creates a plan in category "Cycling"
- THEN the subscriber receives a notification via WebSocket within 3 seconds

#### Scenario: Non-subscriber receives nothing
- GIVEN a user NOT subscribed to category "Cycling"
- WHEN a plan is created in "Cycling"
- THEN no notification is pushed to that user

### Requirement: Live Map Plan Updates

The system MUST broadcast plan INSERT and soft-delete events so map viewers see changes without refresh.

#### Scenario: New plan appears on map in real time
- GIVEN two users viewing the same geographic area
- WHEN user A creates a plan at a location within view
- THEN user B sees the plan pin appear within 3 seconds

#### Scenario: Deleted plan removed from map in real time
- GIVEN a plan visible on the map
- WHEN its creator soft-deletes it
- THEN the plan pin disappears from all viewers' maps within 3 seconds

### Requirement: Realtime Channel Lifecycle

The system MUST subscribe to Realtime channels on component mount, unsubscribe on unmount, and automatically reconnect on connection loss.

#### Scenario: Channel created on mount
- GIVEN a user navigates to the map page
- WHEN the map component mounts
- THEN a Realtime channel subscribing to `plans` table changes is created

#### Scenario: Channel removed on unmount
- GIVEN a user leaves the map page
- WHEN the map component unmounts
- THEN the Realtime channel is unsubscribed

#### Scenario: Automatic reconnection
- GIVEN an active Realtime subscription
- WHEN the WebSocket connection drops
- THEN the system reconnects automatically AND replays missed events

### Requirement: Filtered Subscriptions

The system MAY subscribe to filtered plan changes by geographic bounding box or category to reduce bandwidth and client processing.

#### Scenario: Category-filtered subscription
- GIVEN a user viewing plans only in category "Hiking"
- WHEN the Realtime subscription is established
- THEN only plan changes in "Hiking" trigger client updates

#### Scenario: Location-filtered subscription
- GIVEN a user viewing a specific map viewport
- WHEN the Realtime subscription is established
- THEN only plan changes within the viewport's bounding box trigger updates
