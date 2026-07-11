import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
  // Note: the cae-file-upload demo (#338) runs selection-only (no [url]), so it needs no HttpClient —
  // keeping provideHttpClient out of the eager bundle. Enabling the upload path (a [url]) would add
  // provideHttpClient() here; the upload path itself is verified in file-upload.spec.ts.
  providers: [provideBrowserGlobalErrorListeners()],
};
