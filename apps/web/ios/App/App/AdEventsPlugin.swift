import Foundation
import Capacitor
import FacebookCore
import TikTokBusinessSDK

/// Ponte JS → Meta e TikTok. Ver src/lib/adEvents.ts.
@objc(AdEventsPlugin)
public class AdEventsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AdEventsPlugin"
    public let jsName = "AdEvents"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "logEvent", returnType: CAPPluginReturnPromise)
    ]

    @objc func logEvent(_ call: CAPPluginCall) {
        if let meta = call.getString("meta"), !meta.isEmpty {
            AppEvents.shared.logEvent(AppEvents.Name(meta))
        }
        if let tiktok = call.getString("tiktok"), !tiktok.isEmpty, TikTokBusiness.isInitialized() {
            TikTokBusiness.trackTTEvent(TikTokBaseEvent(eventName: tiktok))
        }
        call.resolve()
    }
}
