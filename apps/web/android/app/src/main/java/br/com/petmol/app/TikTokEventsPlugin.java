package br.com.petmol.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tiktok.TikTokBusinessSdk;
import com.tiktok.appevents.base.EventName;

/** Ponte JS → TikTok App Events SDK. Ver src/lib/tiktokAppEvents.ts. */
@CapacitorPlugin(name = "TikTokEvents")
public class TikTokEventsPlugin extends Plugin {

    @PluginMethod
    public void trackRegistration(PluginCall call) {
        try {
            if (TikTokBusinessSdk.isInitialized()) {
                TikTokBusinessSdk.trackTTEvent(EventName.REGISTRATION);
            }
        } catch (Throwable ignored) {
            // medir anúncio nunca pode quebrar o cadastro
        }
        call.resolve();
    }
}
