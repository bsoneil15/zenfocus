import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Unlock, Package, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { NewsletterSignup } from "./newsletter-signup";

interface SoundscapePack {
  id: string;
  name: string;
  description: string;
  isUnlocked: boolean;
  unlockedBy: string;
  soundscapeIds: string[];
}

interface SoundscapePacksPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onPacksUnlocked?: () => void;
}

export function SoundscapePacksPanel({ 
  isOpen, 
  onClose, 
  onPacksUnlocked 
}: SoundscapePacksPanelProps) {
  const [packs, setPacks] = useState<SoundscapePack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadSoundscapePacks = async () => {
    try {
      const response = await apiRequest("GET", "/api/soundscape-packs");
      const data = await response.json();
      setPacks(data.packs);
    } catch (error) {
      console.error("Failed to load soundscape packs:", error);
      toast({
        title: "Error",
        description: "Failed to load soundscape packs.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSoundscapePacks();
    }
  }, [isOpen]);

  const handlePacksUnlocked = (unlockedCount: number) => {
    // Reload packs to show updated unlock status
    loadSoundscapePacks();
    onPacksUnlocked?.();
  };

  const lockedPacks = packs.filter(pack => !pack.isUnlocked);
  const unlockedPacks = packs.filter(pack => pack.isUnlocked);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" 
      data-testid="soundscape-packs-panel"
    >
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl p-6 transform transition-transform duration-300 max-h-[90vh] overflow-y-auto ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="w-12 h-1 bg-muted rounded-full" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            data-testid="button-close-packs-panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="text-center mb-6">
          <Package className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Soundscape Packs
          </h2>
          <p className="text-sm text-muted-foreground">
            Unlock additional ambient sounds for your focus sessions
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unlocked Packs */}
            {unlockedPacks.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Unlock className="h-4 w-4 text-green-600" />
                  Your Unlocked Packs
                </h3>
                <div className="space-y-3">
                  {unlockedPacks.map((pack) => (
                    <Card key={pack.id} className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100 flex items-center gap-2">
                          <Unlock className="h-4 w-4" />
                          {pack.name}
                        </CardTitle>
                        <CardDescription className="text-green-700 dark:text-green-300">
                          {pack.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Locked Packs & Newsletter Signup */}
            {lockedPacks.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Available to Unlock
                </h3>
                
                <div className="space-y-4">
                  {lockedPacks.map((pack) => (
                    <Card key={pack.id} className="border-dashed">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Lock className="h-4 w-4" />
                          {pack.name}
                        </CardTitle>
                        <CardDescription>
                          {pack.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                  
                  <div className="pt-4">
                    <NewsletterSignup onUnlockPacks={handlePacksUnlocked} />
                  </div>
                </div>
              </div>
            )}

            {/* All packs unlocked */}
            {lockedPacks.length === 0 && unlockedPacks.length > 0 && (
              <div className="text-center py-8">
                <Unlock className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  All packs unlocked!
                </h3>
                <p className="text-sm text-muted-foreground">
                  You have access to all available soundscape packs. Check the audio controls to use them.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}