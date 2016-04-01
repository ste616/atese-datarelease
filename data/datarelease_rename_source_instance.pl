#!/usr/bin/perl

use JSON;
use strict;

my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# The source to rename.
my $src_old = $ARGV[0];

# The epoch name in which to rename it.
my $epname = $ARGV[1];

# The source to add to.
my $src_new = $ARGV[2];

# Begin by making a backup file.
my $catname = $od."/datarelease_catalogue.json";
my $bakname = $catname.".bak";

print "Creating backup catalogue file $bakname...\n";
print "cp $catname $bakname\n";
system "cp $catname $bakname";

print "Reading catalogue...\n";
my $json = JSON->new;
my $catalogue;
if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    die "Can't open file $catname\n";
}

# Check that both sources exist.
if (!defined $catalogue->{$src_old} ||
    !defined $catalogue->{$src_new}) {
    die "Cannot find both sources in catalogue\n";
}

my $odt = $od."/".$epname;
if (!-d $odt) {
    die "Can't find the epoch $epname\n";
}

# Make a backup of the epoch directory.
print "Backing up epoch directory to $odt.bak\n";
print "cp $odt $odt.bak\n";
system "cp $odt $odt.bak";

my @epelems = ( "closurePhase", "declination", "defect", "epochs",
		"fluxDensity", "fluxDensityFit", "hourAngle", "mjd",
		"rightAscension", "arrayConfigurations", "solarAngles" );

print "Searching source $src_old\n";
my $eind_old = -1;
for (my $i = 0; $i <= $#{$catalogue->{$src_old}->{'epochs'}}; $i++) {
    if ($catalogue->{$src_old}->{'epochs'}->[$i] eq $epname) {
	print " found epoch $epname as index $i\n";
	$eind_old = $i;
	last;
    }
}

# Copy the information from the old source to the new source.
if ($eind_old > -1) {
    for (my $i = 0; $i <= $#epelems; $i++) {
	print "  transferring $epelems[$i] value ".
	    $catalogue->{$src_old}->{$epelems[$i]}->[$eind_old]."\n";
	push @{$catalogue->{$src_new}->{$epelems[$i]}},
	$catalogue->{$src_old}->{$epelems[$i]}->[$eind_old];
	splice $catalogue->{$src_old}->{$epelems[$i]}, $eind_old, 1;
    }

    # Rename the JSON files in the epoch directory.
    my $rn_cmd = "rename 's/".$src_old."/".$src_new."/' ".$odt."/".$src_old."_".$epname."*.json";
    print $rn_cmd."\n";
    system $rn_cmd;
} else {
    print " epoch not present\n";
}

# Write the JSON out again.
print "Writing out the catalogue...\n";
open(C, ">".$catname);
print C to_json $catalogue;
close(C);

print "Epoch $epname for source $src_old transferred to $src_new.\n";
