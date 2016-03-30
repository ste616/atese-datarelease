#!/usr/bin/perl

use JSON;
use strict;

my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# The epoch name to remove.
my $epname = $ARGV[0];

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

my $odt = $od."/".$epname;
if (!-d $odt) {
    die "Can't find the epoch $epname\n";
}

# Make a backup of the epoch directory.
print "Backing up epoch directory to $odt.bak\n";
print "mv $odt $odt.bak\n";
system "mv $odt $odt.bak";

my @epelems = ( "closurePhase", "declination", "defect", "epochs",
		"fluxDensity", "fluxDensityFit", "hourAngle", "mjd",
		"rightAscension" );

foreach my $s (keys $catalogue) {
    print "Searching source $s\n";
    my $eind = -1;
    for (my $i = 0; $i <= $#{$catalogue->{$s}->{'epochs'}}; $i++) {
	if ($catalogue->{$s}->{'epochs'}->[$i] eq $epname) {
	    print " found epoch $epname as index $i\n";
	    $eind = $i;
	    last;
	}
    }
    if ($eind > -1) {
	# Kill this epoch.
	for (my $i = 0; $i <= $#epelems; $i++) {
	    print "  removing $epelems[$i] value ".$catalogue->{$s}->{$epelems[$i]}->[$eind]."\n";
	    splice $catalogue->{$s}->{$epelems[$i]}, $eind, 1;
	}
    } else {
	print " epoch not present\n";
    }
}

# Write the JSON out again.
print "Writing out the catalogue...\n";
open(C, ">".$catname);
print C to_json $catalogue;
close(C);

print "Epoch $epname removed.\n";
