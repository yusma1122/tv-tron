alter table public.media drop constraint if exists media_media_type_check;
alter table public.media add constraint media_media_type_check
  check (media_type in ('image','video','slideshow'));

alter table public.signage_playlist drop constraint if exists signage_playlist_slide_type_check;
alter table public.signage_playlist add constraint signage_playlist_slide_type_check
  check (slide_type in ('schedule','announcement','event','gallery','academic','video','slideshow'));

insert into public.signage_playlist (slide_type, title, sort_order, duration_seconds)
select 'slideshow', 'Slideshow',
       (select coalesce(max(sort_order),0)+1 from public.signage_playlist), 10
where not exists (select 1 from public.signage_playlist where slide_type = 'slideshow');