-- Package 28: links to pages in the text, and the pages that link a page.
--
-- A link is inline content {"type": "pageLink", "props": {"pageId": ...}}
-- in a document. page_backlinks lists the readable, active pages whose text
-- links the page, with the caller's rights (RLS decides what is listed).
-- It reads every readable document; fine for now, an index can follow.
--
-- Backward compatible: a new function only.

create or replace function public.page_backlinks(p_page_id uuid)
returns table (id uuid, title text, icon text, kind text)
language sql
stable
set search_path = ''
as $$
  select p.id, p.title, p.icon, p.kind
  from public.pages p
  join public.page_documents d on d.page_id = p.id
  where p_page_id is not null
    and p.id <> p_page_id
    and not p.is_archived
    and jsonb_path_exists(
      d.document,
      'strict $.** ? (@.type == "pageLink" && @.props.pageId == $id)',
      jsonb_build_object('id', p_page_id::text)
    )
  order by p.title
  limit 100
$$;

revoke execute on function public.page_backlinks(uuid) from public, anon;
grant execute on function public.page_backlinks(uuid) to authenticated;
