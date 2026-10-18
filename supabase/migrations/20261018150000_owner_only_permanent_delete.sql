-- Decision (user, 2026-10-18): only the page owner deletes a page for good.
-- Moving to the trash and restoring (is_archived) stay open to everyone
-- with edit rights, via the update policy. Subpages still go with their
-- parent (on delete cascade), whoever owns them, as before.
-- A non-owner's delete now affects no rows (RLS filters, no error); the
-- app checks the returned rows.
drop policy "Users can delete editable pages" on public.pages;

create policy "Page owners can delete pages"
on public.pages
for delete
to authenticated
using (owner_id = (select auth.uid()));
