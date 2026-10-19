import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseConnection, deleteDatabase } from "./indexed-db";

let factory: IDBFactory;

const connect = () =>
    new DatabaseConnection(factory, "nodi-test", 1, (database) => database.createObjectStore("items"));

async function databaseNames(): Promise<string[]> {
    return (await factory.databases()).map((info) => info.name ?? "");
}

beforeEach(() => {
    factory = new IDBFactory();
});

describe("DatabaseConnection", () => {
    it("does not reopen after close", async () => {
        const connection = connect();
        await connection.open();

        await connection.close();

        await expect(connection.open()).rejects.toThrow("gelöscht");
    });

    it("closes and stays closed when another tab deletes the database", async () => {
        const otherTab = connect();
        await otherTab.open();

        await deleteDatabase(factory, "nodi-test");

        await expect(otherTab.open()).rejects.toThrow("gelöscht");
        expect(await databaseNames()).toEqual([]);
    });
});
