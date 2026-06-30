package demodata

import "errors"

var errNotDemoTenant = errors.New("demo data actions are only allowed on DEMO000 or BLUEARM tenants")
