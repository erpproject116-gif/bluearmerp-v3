package config

import "testing"

func TestResolveDatabaseURL(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		supabase   string
		dbPassword string
		want       string
	}{
		{
			name:     "local default",
			supabase: "http://127.0.0.1:54321",
			want:     localSupabaseDBURL,
		},
		{
			name:       "hosted with password",
			supabase:   "https://hqmhlvahlvrtxtwecdip.supabase.co",
			dbPassword: "secret",
			want:       "postgresql://postgres:secret@db.hqmhlvahlvrtxtwecdip.supabase.co:5432/postgres",
		},
		{
			name:       "missing password",
			supabase:   "https://abcdefgh.supabase.co",
			dbPassword: "",
			want:       "",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := resolveDatabaseURL(tc.supabase, tc.dbPassword)
			if got != tc.want {
				t.Fatalf("resolveDatabaseURL() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestProjectRefFromURL(t *testing.T) {
	t.Parallel()
	if got := projectRefFromURL("https://hqmhlvahlvrtxtwecdip.supabase.co"); got != "hqmhlvahlvrtxtwecdip" {
		t.Fatalf("got %q", got)
	}
}
