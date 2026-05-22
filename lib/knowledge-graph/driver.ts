import neo4j, { type Driver, type Session } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER || "neo4j";
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !password) {
      throw new Error(
        "NEO4J_URI and NEO4J_PASSWORD environment variables required. " +
        "Create a free Neo4j Aura instance at https://neo4j.com/cloud/aura-free/"
      );
    }

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

export function getSession(): Session {
  return getDriver().session();
}

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = getSession();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function runWrite(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite((tx) => tx.run(cypher, params));
  } finally {
    await session.close();
  }
}
