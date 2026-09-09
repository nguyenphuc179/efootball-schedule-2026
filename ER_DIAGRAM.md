# Entity-Relationship Diagram

Firestore is a document database (no joins/foreign keys enforced by the engine itself), but the app
maintains a clear relational shape via ID references. This is the logical ER model:

```mermaid
erDiagram
    USER ||--o{ TEAM : "manages (optional)"
    USER {
        string uid PK
        string email
        string displayName
        string photoURL
        string role "admin | viewer"
        timestamp createdDate
    }

    TOURNAMENT ||--o{ TEAM : "has"
    TOURNAMENT ||--o{ MATCH : "schedules"
    TOURNAMENT ||--|| STANDING : "has one standings doc"
    TOURNAMENT ||--o{ CHECKIN : "records"
    TOURNAMENT {
        string id PK
        string name
        string description
        string image
        string location
        timestamp startDate
        timestamp endDate
        string status "upcoming | ongoing | completed"
        string type "round_robin | knockout | group_knockout"
        number numberOfTeams
        string createdBy FK "users.uid"
        timestamp createdDate
    }

    TEAM ||--o{ PLAYER : "has roster"
    TEAM ||--o{ MATCH : "plays (home or away)"
    TEAM ||--o{ CHECKIN : "checks in"
    TEAM {
        string id PK
        string tournamentId FK
        string teamName
        string logo
        string manager
        string managerUid FK "users.uid, optional"
        number playersCount
        timestamp createdDate
    }

    PLAYER {
        string id PK
        string teamId FK
        string fullName
        number shirtNumber
        string position
        number goals
        number yellowCards
        number redCards
    }

    MATCH }o--|| TEAM : "homeTeamId"
    MATCH }o--|| TEAM : "awayTeamId"
    MATCH {
        string id PK
        string tournamentId FK
        string round
        string groupName "nullable, group stage only"
        string homeTeamId FK
        string awayTeamId FK
        number homeScore "nullable until played"
        number awayScore "nullable until played"
        timestamp matchDate
        string matchTime
        string location
        string status "scheduled | live | completed | postponed"
    }

    STANDING ||--o{ STANDING_ROW : "contains"
    STANDING {
        string tournamentId PK
        timestamp lastUpdated
    }

    STANDING_ROW }o--|| TEAM : "teamId"
    STANDING_ROW {
        string teamId PK
        number position
        number played
        number won
        number drawn
        number lost
        number goalsFor
        number goalsAgainst
        number goalDifference
        number points
        string groupName "nullable"
    }

    NOTIFICATION }o--|| USER : "targetUid (nullable = broadcast)"
    NOTIFICATION {
        string id PK
        string title
        string body
        string type "tournament_created | match_reminder | result_updated | standings_updated | tournament_started | tournament_finished"
        string audience "all | user"
        string targetUid FK "nullable"
        string tournamentId FK "nullable"
        boolean read
        timestamp createdDate
    }

    CHECKIN }o--|| TEAM : "teamId"
    CHECKIN }o--|| TOURNAMENT : "tournamentId"
    CHECKIN {
        string id PK
        string tournamentId FK
        string teamId FK
        string checkedInByUid FK "users.uid"
        timestamp checkedInAt
        string method "qr_scan | manual"
    }
```

## Notes on denormalization

* `STANDING_ROW.teamId` duplicates `TEAM.teamName` and `TEAM.logo` at write time (not shown above as
  separate fields for brevity, but present in `standing.model.ts` as `teamName`/`teamLogo`) so the
  standings view never needs a second read per row — critical for a fast mobile list render.
* `TEAM.playersCount` is a counter maintained by Cloud Firestore triggers-equivalent client logic
  (incremented/decremented in the same batch as player add/remove) rather than counted live, to keep
  the team list query cheap.
