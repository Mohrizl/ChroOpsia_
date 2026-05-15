-- Jalankan jika insert invites gagal (tabel tetap 0 baris)
-- Supabase → SQL Editor → Run

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.invites;
CREATE POLICY "Enable insert for authenticated users only"
  ON public.invites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_id);

DROP POLICY IF EXISTS "Users can view their own received invites" ON public.invites;
CREATE POLICY "Users can view their own received invites"
  ON public.invites FOR SELECT
  TO authenticated
  USING (auth.uid() = to_id OR auth.uid() = from_id);

GRANT SELECT, INSERT ON public.invites TO authenticated;
ALTER TABLE public.invites REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invites;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
