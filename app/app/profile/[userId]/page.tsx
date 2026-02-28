import { redirect } from 'next/navigation';

interface ProfileUserPageProps {
  params: { userId: string };
}

export default async function ProfileUserPage({ params }: ProfileUserPageProps) {
  const { userId } = params;
  redirect(`/app/player/${userId}`);
}
