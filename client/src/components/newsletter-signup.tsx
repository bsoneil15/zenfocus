import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Gift, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface NewsletterSignupProps {
  onUnlockPacks?: (packsCount: number) => void;
}

export function NewsletterSignup({ onUnlockPacks }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    if (!consentChecked) {
      toast({
        title: "Consent required",
        description: "Please confirm you want to subscribe to our newsletter",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await apiRequest("POST", "/api/newsletter/signup", {
        email: email.trim(),
      });
      
      const data = await response.json();
      
      if (data.alreadySubscribed) {
        toast({
          title: "Already subscribed!",
          description: "You're already on our newsletter list.",
        });
      } else {
        toast({
          title: "Welcome to our newsletter! 🎉",
          description: `Unlocked ${data.unlockedPacks} new soundscape packs!`,
        });
        
        onUnlockPacks?.(data.unlockedPacks);
        setIsSubscribed(true);
      }
    } catch (error) {
      console.error("Newsletter signup failed:", error);
      toast({
        title: "Signup failed",
        description: "Please check your email and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubscribed) {
    return (
      <Card className="w-full max-w-md border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
            Welcome to Focus Flow!
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300">
            You've unlocked new soundscape packs. Check the audio controls to explore them!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md" data-testid="newsletter-signup">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-primary" />
          Unlock Soundscape Packs
        </CardTitle>
        <CardDescription>
          Join our newsletter to unlock additional focus soundscapes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium text-sm mb-2">What you'll get:</h4>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• Nature Sounds Pack (forest, ocean, mountain breeze)</li>
              <li>• Urban Ambience Pack (coffee shops, libraries)</li>
              <li>• Productivity tips and focus techniques</li>
            </ul>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                disabled={isSubmitting}
                data-testid="input-newsletter-email"
              />
            </div>
            
            <div className="flex items-start space-x-2">
              <Checkbox
                id="newsletter-consent"
                checked={consentChecked}
                onCheckedChange={(checked) => setConsentChecked(checked === true)}
                disabled={isSubmitting}
                data-testid="checkbox-newsletter-consent"
              />
              <label
                htmlFor="newsletter-consent"
                className="text-xs text-muted-foreground leading-4 cursor-pointer"
              >
                I agree to receive email communications and newsletters. You can unsubscribe at any time.
              </label>
            </div>
            
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !email.trim() || !consentChecked}
              data-testid="button-newsletter-signup"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Subscribing...
                </>
              ) : (
                <>
                  <Gift className="h-4 w-4 mr-2" />
                  Unlock Packs
                </>
              )}
            </Button>
          </form>
          
          <p className="text-xs text-muted-foreground text-center">
            We respect your privacy. Unsubscribe anytime.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}