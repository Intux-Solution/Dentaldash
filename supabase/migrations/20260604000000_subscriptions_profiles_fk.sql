-- Agrega FK de subscriptions.user_id -> public.profiles(id)
-- para que PostgREST pueda resolver el join anidado profiles->subscriptions.
-- La FK existente (-> auth.users) se mantiene intacta.

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
