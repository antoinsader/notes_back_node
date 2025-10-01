# Notes api:
Simple notes api built with node.js, express, sqlite, jwt authentication, crypto encoding.

## Setup:
1- Clone the repo

2- Install dependencies:
```bash
npm install
```

3- Create .env file in the root folder with the following variables:

- ENCRYPTION_KEY: must be 32 digits
- JWT_SECRET: Your super secure string for JWT

4- Configure config.js:

- PROD: set true in production
- FRONT_URI: front-end origin to be allowed by CORS
- API_PORT: set the port that the API will listen to
- DB_NAME: containing the name of the sqlite file that will be created in the root

5- Start api:

```bash
npm run start
```

## Explain:

- End points marked as protected should have Authorization header (all except /auth):
```
Authorization: Baerer <YOUR TOKEN>
```
- Token would be generated when using auth/login or auth/new_code
- You can test endpoints using the file *test.rest*

## Endpoints:
All endpoints using POST

### /auth:
- auth/login:

  Body: {user_code: "xxxx"}

  Returns: {token: "YOUR TOKEN"}

- auth/new_code:

  Body: {}

  Returns: {user_code: "NEW CODE TO BE USED FOR LOGIN", token: "YOUR TOKEN"}

### /note_type:
- note_type/get_all:

  Body: {}

  Returns: [{note_type_id: "ID", note_type_title: "General notes"},..]

- note_type/insert:

  Body: {note_type_title: "NEW NOTE TYPE"}

  Returns: {lastId: "ID THAT WAS INSERTED", changes: "NUM OF CHANGES MADE"}

- note_type/update:

  Body: {note_type_id: "ID TO BE UPDATED", note_type_title: "UPDATED NOTE TYPE"}

  Returns: {changes: "NUM OF CHANGES MADE"}

- note_type/delete:

  Body: {note_type_id: "ID TO BE deleted"}

  Returns: {changes: "NUM OF CHANGES MADE"}

  
### /notes:
- notes/get_all:

  Body: {}

  Returns: [{note_type_id: "NOTE TYPE ID", content: "Your note content"},..]

- notes/insert:

  Body: {note_type_id: "note type id", content:"Content to be inserted"}

  Returns: {lastId: "ID THAT WAS INSERTED", changes: "NUM OF CHANGES MADE"}

- notes/update:

  Body: {note_id: "ID TO BE UPDATED", note_type_id: "new note type id", content: "UPdated content"}

  Returns: {changes: "NUM OF CHANGES MADE"}

- notes/delete:

  Body: {note_id: "ID TO BE deleted"}

  Returns: {changes: "NUM OF CHANGES MADE"}


## Error handling:
All errors that the API would throw will be logged in logs/error.log

