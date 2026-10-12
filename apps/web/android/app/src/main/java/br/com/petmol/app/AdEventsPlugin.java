package br.com.petmol.app;

import com.facebook.appevents.AppEventsLogger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tiktok.TikTokBusinessSdk;
import com.tiktok.appevents.base.EventName;

/** Ponte JS → Meta e TikTok. Ver src/lib/adEvents.ts. */
@CapacitorPlugin(name = "AdEvents")
public class AdEventsPlugin extends Plugin {

    @PluginMethod
    public void logEvent(PluginCall call) {
        String meta = call.getString("meta");
        String tiktok = call.getString("tiktok");
        try {
            if (meta != null && !meta.isEmpty()) {
                AppEventsLogger.newLogger(getContext()).logEvent(meta);
            }
        } catch (Throwable ignored) {
            // medir anúncio nunca pode quebrar o app
        }
        try {
            if (tiktok != null && !tiktok.isEmpty() && TikTokBusinessSdk.isInitialized()) {
                if ("Registration".equals(tiktok)) {
                    TikTokBusinessSdk.trackTTEvent(EventName.REGISTRATION);
                } else {
                    TikTokBusinessSdk.trackEvent(tiktok);
                }
            }
        } catch (Throwable ignored) {
        }
        call.resolve();
    }
}
