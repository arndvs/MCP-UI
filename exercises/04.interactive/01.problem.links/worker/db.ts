import { DBClient } from '@epic-web/epicme-db-client'

const EPIC_ME_SERVER_URL = 'http://localhost:7787'

export const db = new DBClient(EPIC_ME_SERVER_URL)
