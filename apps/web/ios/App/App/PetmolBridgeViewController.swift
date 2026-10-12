import UIKit
import Capacitor

/// Bridge do Capacitor + plugins locais (que não vêm de pacote npm).
class PetmolBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AdEventsPlugin())
    }
}
