import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  clearNote,
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-and-notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role: UserRole.Student })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("bookmarks an unbookmarked Lesson, and a second toggle removes it", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    expect(() =>
      db.insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow(/UNIQUE/);
    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates the Note with its body trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  Revisit the hooks bit  ", NOW);

    expect(result).toMatchObject({ ok: true, note: { body: "Revisit the hooks bit" } });
    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Revisit the hooks bit",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body on a re-save and moves only the last-edited time on", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toMatchObject({
      body: "Second draft",
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);
    expect(() =>
      db.insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Another" })
        .run()
    ).toThrow(/UNIQUE/);
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "a".repeat(2000), NOW)).toMatchObject({
      ok: true,
    });
  });

  it("refuses a Note over 2,000 characters without storing it", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "a".repeat(2001), NOW)).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("removes the Note when the Student clears it", () => {
    saveNote(db, base.user.id, lessonIds[0], "Gone soon", NOW);
    clearNote(db, base.user.id, lessonIds[0]);
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
    expect(listNotes(db, base.user.id)).toEqual([]);
  });

  it("keeps the body exactly as typed, Markdown characters included", () => {
    saveNote(db, base.user.id, lessonIds[0], "# not a heading\n*not bold*", NOW);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("# not a heading\n*not bold*");
  });
});

describe("the Saved lists", () => {
  it("contain only the Student's own rows, newest first, with their Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], LATER);
    toggleBookmark(db, other.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[1], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Newer", LATER);
    saveNote(db, other.id, lessonIds[0], "Not yours", LATER);

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1], lessonTitle: "Lesson 2", courseTitle: "Test Course", courseSlug: "test-course" },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1", courseTitle: "Test Course" },
    ]);
    expect(listNotes(db, base.user.id).map((note) => note.body)).toEqual(["Newer", "Older"]);
  });
});

describe("approving a Refund", () => {
  it("keeps the Student's Bookmarks and Notes", async () => {
    const notifications = fakeNotifications();
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900, createdAt: NOW.toISOString() })
      .returning()
      .get();
    db.insert(schema.enrollments).values({ userId: base.user.id, courseId: base.course.id }).run();

    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Still mine", NOW);

    const raised = await raiseRefundRequest(db, purchase.id, base.user.id, "Not for me.", NOW, notifications);
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(db, raised.refundRequestId, admin.id, null, NOW, notifications);
    expect(approved).toMatchObject({ ok: true });

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Still mine");
  });
});
