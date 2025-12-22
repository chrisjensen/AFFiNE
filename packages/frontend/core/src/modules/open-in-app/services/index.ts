import { LiveData, OnEvent, Service } from '@toeverything/infra';

import type { GlobalState } from '../../storage';
import { WorkbenchLocationChanged } from '../../workbench/services/workbench';
import type { WorkspacesService } from '../../workspace';

const storageKey = 'open-link-mode';

export enum OpenLinkMode {
  ALWAYS_ASK = 'always-ask', // default
  OPEN_IN_WEB = 'open-in-web',
  OPEN_IN_DESKTOP_APP = 'open-in-desktop-app',
}

@OnEvent(WorkbenchLocationChanged, e => e.onNavigation)
export class OpenInAppService extends Service {
  private initialized = false;

  private initialUrl: string | undefined;

  readonly showOpenInAppBanner$ = new LiveData<boolean>(false);
  readonly showOpenInAppPage$ = new LiveData<boolean | undefined>(undefined);

  constructor(
    public readonly globalState: GlobalState,
    public readonly workspacesService: WorkspacesService
  ) {
    super();
  }

  onNavigation() {
    // check doc id instead?
    if (window.location.href === this.initialUrl) {
      return;
    }
    this.showOpenInAppBanner$.next(false);
  }

  /**
   * Given the initial URL, check if we need to redirect to the desktop app.
   */
  bootstrap() {
    if (this.initialized || !window) {
      return;
    }

    this.initialized = true;
    this.initialUrl = window.location.href;

    // Disabled: Custom build does not prompt for desktop app download
    this.showOpenInAppPage$.next(false);
  }

  showOpenInAppPage() {
    this.showOpenInAppPage$.next(true);
  }

  hideOpenInAppPage() {
    this.showOpenInAppPage$.next(false);
  }

  getOpenLinkMode() {
    return (
      this.globalState.get<OpenLinkMode>(storageKey) ?? OpenLinkMode.ALWAYS_ASK
    );
  }

  openLinkMode$ = LiveData.from(
    this.globalState.watch<OpenLinkMode>(storageKey),
    this.getOpenLinkMode()
  ).map(v => v ?? OpenLinkMode.ALWAYS_ASK);

  setOpenLinkMode(mode: OpenLinkMode) {
    this.globalState.set(storageKey, mode);
  }

  dismissBanner(rememberMode: OpenLinkMode | undefined) {
    if (rememberMode) {
      this.globalState.set(storageKey, rememberMode);
    }
    this.showOpenInAppBanner$.next(false);
  }
}
