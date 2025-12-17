#!/usr/bin/env -S node --disable-warning=ExperimentalWarning

import { execute } from "@oclif/core";

await execute({ development: true, dir: import.meta.url });
