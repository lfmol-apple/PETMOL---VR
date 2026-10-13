import Foundation
import Capacitor
import TikTokBusinessSDK

/// Ponte JS → TikTok App Events SDK. Ver src/lib/tiktokAppEvents.ts.
@objc(TikTokEventsPlugin)
public class TikTokEventsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TikTokEventsPlugin"
    public let jsName = "TikTokEvents"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "trackRegistration", returnType: CAPPluginReturnPromise)
    ]

    @objc func trackRegistration(_ call: CAPPluginCall) {
        if TikTokBusiness.isInitialized() {
            TikTokBusiness.trackTTEvent(TikTokBaseEvent(eventName: "Registration"))
        }
        call.resolve()
    }
}
