import { createFileRoute } from "@tanstack/react-router";
import { useUser, useClerk } from "@clerk/tanstack-react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Shield, Calendar, LogOut, Upload, Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCloudinaryUploadSignature } from "@/lib/products-admin.server";
import { adminSaveAvatarUrl, adminGetAvatarUrl } from "@/lib/admin/server-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Diplomat Global Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dbAvatarUrl, setDbAvatarUrl] = useState<string | null>(null);
  const getSignature = useServerFn(getCloudinaryUploadSignature);
  const saveAvatarUrl = useServerFn(adminSaveAvatarUrl);
  const getAvatarUrl = useServerFn(adminGetAvatarUrl);

  // Load persisted avatar from admin_users on mount
  useEffect(() => {
    getAvatarUrl()
      .then((res) => {
        if (res.avatar_url) setDbAvatarUrl(res.avatar_url);
      })
      .catch(() => {});
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side validation before upload
    const { validateImageFile } = await import("@/lib/upload-validation");
    const err = await validateImageFile(file);
    if (err) {
      toast.error(err);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const sig = await getSignature({ data: { folder: "avatars" } });
      if (!sig.ok) {
        toast.error(sig.message);
        setUploading(false);
        return;
      }
      if (!sig.allowedFormatsParam) {
        toast.error("The upload policy could not be loaded. Please try again.");
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sig.apiKey);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("folder", sig.folder);
      formData.append("allowed_formats", sig.allowedFormatsParam);
      formData.append("signature", sig.signature);
      const res = await fetch(
        "https://api.cloudinary.com/v1_1/" + sig.cloudName + "/image/upload",
        { method: "POST", body: formData },
      );
      const result = await res.json();
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      // Persist the Cloudinary URL to admin_users
      const saveResult = await saveAvatarUrl({ data: { avatar_url: result.secure_url } });
      if (saveResult.ok) {
        setDbAvatarUrl(result.secure_url);
        toast.success("Avatar updated!");
        window.dispatchEvent(
          new CustomEvent("admin-avatar-updated", { detail: { avatar_url: result.secure_url } }),
        );
      } else {
        toast.error(saveResult.message || "Upload succeeded but could not save.");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const { user } = useUser();
  const { signOut } = useClerk();

  // Use DB avatar as primary, fall back to Clerk imageUrl
  const avatarSrc = dbAvatarUrl || user?.imageUrl || null;
  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your account information</p>
      </div>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarSrc || undefined} alt={user?.fullName || "User"} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {user?.fullName || "Administrator"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
              <Badge className="mt-2 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Administrator
              </Badge>
              <p className="mt-2 text-xs text-gray-400">Hover over avatar to upload</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardHeader>
          <CardTitle className="text-sm text-gray-900 dark:text-white">Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <User className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Full Name</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.fullName || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <Mail className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.primaryEmailAddress?.emailAddress || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <Shield className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Role</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Owner / Administrator
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Account Created</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("en-NG", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-[#0F0F12]">
        <CardContent className="p-4">
          <Button
            variant="destructive"
            onClick={() => signOut({ redirectUrl: "/admin/login" })}
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
