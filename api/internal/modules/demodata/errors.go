package demodata

import "errors"

var errNotDemoTenant = errors.New("demo data actions are only allowed on demo tenants")
